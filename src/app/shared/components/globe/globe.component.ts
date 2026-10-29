import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { GlobeInstance } from 'globe.gl';
import { CountryShape } from '../../../core/services/world.service';
import { MapFocus } from '../../../core/services/map-focus.service';
import { ThemeService } from '../../../core/services/theme.service';

export interface GlobeMarker {
  lat: number;
  lng: number;
  /** Tooltip text, e.g. "Rome, Italy" */
  label: string;
}

const DEFAULT_ALTITUDE = 2.2;
const FLY_MS = 1000;
// A bit longer than the dialog's own entrance, so the globe settles just after the dialog is in place
const SLIDE_MS = 400;

interface Size {
  width: number;
  height: number;
}

// Starts moving at once and settles gently: the right feel for motion that answers a click
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

// The two three.js PerspectiveCamera methods used here (three's own types aren't installed)
interface ViewOffsetCamera {
  setViewOffset(
    fullWidth: number,
    fullHeight: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void;
  clearViewOffset(): void;
}

// 3D scratch map: visited countries filled, a pin per city. globe.gl (three.js + WebGL) is loaded with a dynamic
// import, so its ~600 KB only downloads when the globe is shown, and only in the browser (afterNextRender).
@Component({
  selector: 'app-globe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './globe.component.html',
  styleUrl: './globe.component.css',
})
export class GlobeComponent {
  readonly shapes = input.required<CountryShape[]>();
  readonly visitedCodes = input.required<ReadonlySet<string>>();
  readonly markers = input.required<GlobeMarker[]>();
  /** Where the camera should fly to; each new value moves it once, after that the user is free to spin */
  readonly focus = input<MapFocus | null>(null);
  /** Pixels of the right edge covered by something (the docked add dialog); the globe centres in the rest */
  readonly insetRight = input(0);
  readonly countryClick = output<string>();

  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');

  private readonly canvasHost = viewChild.required<ElementRef<HTMLElement>>('canvasHost');
  private readonly probe = viewChild.required<ElementRef<HTMLElement>>('probe');
  private readonly theme = inject(ThemeService);
  private readonly globe = signal<GlobeInstance | null>(null);
  private readonly size = signal<Size>({ width: 0, height: 0 });

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(async () => {
      try {
        const { default: Globe } = await import('globe.gl');
        if (destroyRef.destroyed) return;
        const host = this.canvasHost().nativeElement;
        const globe = new Globe(host, { animateIn: false })
          .showGraticules(true)
          .atmosphereAltitude(0.12)
          .polygonAltitude((d) => (this.isVisited(d) ? 0.012 : 0.006))
          .polygonsTransitionDuration(300)
          .polygonLabel((d) => escapeHtml((d as CountryShape).properties.name))
          .onPolygonClick((d) => this.countryClick.emit((d as CountryShape).properties.iso))
          .pointLat('lat')
          .pointLng('lng')
          .pointAltitude(0.02)
          .pointRadius(0.45)
          .pointLabel((d) => escapeHtml((d as GlobeMarker).label))
          .pointOfView({ altitude: DEFAULT_ALTITUDE });

        const resize = new ResizeObserver(([entry]) => {
          const { width, height } = entry.contentRect;
          globe.width(width).height(height);
          this.size.set({ width, height });
        });
        resize.observe(host);
        destroyRef.onDestroy(() => {
          resize.disconnect();
          globe._destructor();
        });

        this.globe.set(globe);
        this.status.set('ready');
      } catch (error) {
        // No WebGL (old device, disabled GPU, test runner): the rest of the dashboard still works
        console.error('Globe failed to start', error);
        this.status.set('error');
      }
    });

    // Re-colour whenever the theme flips; tokens are light-dark() CSS, so read them resolved from the DOM
    effect(() => {
      const globe = this.globe();
      this.theme.isDark();
      if (!globe) return;
      const color = (token: string) => this.resolveColor(token);
      const visited = color('--pb-visited');
      const land = color('--pb-land');
      const line = color('--pb-globe-line');
      const marker = color('--pb-marker');
      const ocean = color('--pb-ocean');
      globe
        .backgroundColor('rgba(0,0,0,0)')
        .atmosphereColor(ocean)
        .polygonCapColor((d) => (this.isVisited(d) ? visited : land))
        .polygonSideColor(() => line)
        .polygonStrokeColor(() => line)
        .pointColor(() => marker);
      // The sphere itself is a three.js MeshPhongMaterial; tint it to the ocean colour (no texture image)
      (globe.globeMaterial() as unknown as { color: { set(c: string): void } }).color.set(ocean);
    });

    // Data changes: re-run the accessors (polygonsData with the same array still re-evaluates colours)
    effect(() => {
      const globe = this.globe();
      const shapes = this.shapes();
      this.visitedCodes();
      const markers = this.markers();
      if (!globe) return;
      globe.polygonsData([...shapes]).pointsData(markers);
    });

    // Fly to each focus request (also one made before the globe finished loading)
    effect(() => {
      const globe = this.globe();
      const focus = this.focus();
      if (!globe || !focus) return;
      globe.pointOfView(focus, FLY_MS);
    });

    // Slide the picture left so the globe centres in the uncovered part. This shifts the camera's view
    // window (three.js setViewOffset) rather than its aim, so it looks the same at any latitude or zoom,
    // and clicks still hit the right country because picking uses the same projection.
    effect(() => {
      const globe = this.globe();
      const size = this.size();
      const target = this.insetRight() / 2;
      if (!globe || !size.width) return;
      // The slide reads and writes plain fields every frame; it isn't state the effect should track
      untracked(() => this.slideTo(globe, target, size));
    });
    destroyRef.onDestroy(() => cancelAnimationFrame(this.slideFrame));
  }

  private shift = 0; // px the picture is currently slid left
  private slideFrame = 0;

  // Eases the view offset from where it is now to `target` (a resize mid-slide just continues from there).
  // globe.gl re-renders every frame anyway, so each step only has to update the camera.
  private slideTo(globe: GlobeInstance, target: number, { width, height }: Size): void {
    cancelAnimationFrame(this.slideFrame);
    const camera = globe.camera() as unknown as ViewOffsetCamera;
    const apply = (x: number) => {
      this.shift = x;
      if (x) {
        camera.setViewOffset(width, height, x, 0, width, height);
      } else {
        camera.clearViewOffset();
      }
    };

    const from = this.shift;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (from === target || reduceMotion) {
      apply(target);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / SLIDE_MS);
      apply(from + (target - from) * easeOutCubic(t));
      if (t < 1) this.slideFrame = requestAnimationFrame(step);
    };
    this.slideFrame = requestAnimationFrame(step);
  }

  protected zoom(factor: number): void {
    const globe = this.globe();
    if (!globe) return;
    const { altitude } = globe.pointOfView();
    globe.pointOfView({ altitude: Math.min(6, Math.max(0.4, altitude * factor)) }, 300);
  }

  protected resetView(): void {
    this.globe()?.pointOfView({ lat: 20, lng: 0, altitude: DEFAULT_ALTITUDE }, 600);
  }

  private isVisited(shape: object): boolean {
    return this.visitedCodes().has((shape as CountryShape).properties.iso);
  }

  private resolveColor(token: string): string {
    const probe = this.probe().nativeElement;
    probe.style.color = `var(${token})`;
    return getComputedStyle(probe).color;
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
