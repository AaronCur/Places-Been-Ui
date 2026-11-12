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
import { borderPositions } from './country-borders';
import type { BorderLines } from './border-lines';

export interface GlobeMarker {
  lat: number;
  lng: number;
  /** Tooltip text, e.g. "Rome, Italy" */
  label: string;
  /** Drawn bigger and in the primary colour: a place picked but not saved yet */
  highlight?: boolean;
}

const DEFAULT_ALTITUDE = 2.2;
const FLY_MS = 1000;
// A bit longer than the dialog's own entrance, so the globe settles just after the dialog is in place
const SLIDE_MS = 400;
const POLYGONS_MS = 300;
// Countries' heights above the globe, in globe radii: visited ones stand out
const VISITED_ALTITUDE = 0.012;
const LAND_ALTITUDE = 0.006;
// globe.gl's default for markers growing in
const POINTS_MS = 1000;
// How long the globe keeps drawing after the last thing that moved it: covers the spin coasting to a stop
// after a drag (the controls' damping) and a hover tooltip following the pointer
const IDLE_MS = 1500;
// Drawing at the full device pixel ratio (2–3 on tablets and phones) costs 2–4x the pixels for edges that
// look almost the same at 1.5
const MAX_PIXEL_RATIO = 1.5;

interface Size {
  width: number;
  height: number;
}

// Starts moving at once and settles gently: the right feel for motion that answers a click
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** Position of a slide from `from` to `target` once `t` (0–1) of its duration has passed */
export const slideStep = (from: number, target: number, t: number) =>
  from + (target - from) * easeOutCubic(t);

/**
 * Camera altitude (in globe radii above the surface) at which the globe spans `fill` (0–1) of the view's
 * narrower side. `fovDegrees` is the camera's vertical field of view; the horizontal one follows from the
 * aspect ratio, so a tall phone view is limited by its width.
 */
export function altitudeToFit(width: number, height: number, fill: number, fovDegrees: number) {
  const tanHalfV = Math.tan((fovDegrees * Math.PI) / 360);
  const tanHalfNarrow = Math.min(tanHalfV, tanHalfV * (width / height));
  // The globe's edge is where the line of sight grazes it: sin(angle) = radius / distance from the centre
  const halfAngle = Math.atan(fill * tanHalfNarrow);
  return 1 / Math.sin(halfAngle) - 1;
}

/**
 * Runs a render loop only while needed. Each wake() keeps it running for `busyMs` (something animating: a
 * fly-to, a transition) plus `idleMs`, then pauses it; a wake while running just extends the time, so a drag
 * or a hover keeps it going for as long as it lasts. Starts running, as globe.gl's loop does.
 */
export class IdleLoop {
  private running = true;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly pause: () => void,
    private readonly resume: () => void,
    private readonly idleMs: number,
  ) {}

  wake(busyMs = 0): void {
    if (!this.running) {
      this.running = true;
      this.resume();
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.running = false;
      this.pause();
    }, busyMs + this.idleMs);
  }

  /** No more pausing (the globe is being destroyed) */
  stop(): void {
    clearTimeout(this.timer);
  }
}

/**
 * `markers`, with each one equal to a marker in `cache` (the last call's result) swapped for that same
 * object, and the cache for next time. globe.gl matches data to 3D objects by identity, so only markers that
 * really changed get rebuilt.
 */
export function reuseMarkers(
  markers: readonly GlobeMarker[],
  cache: ReadonlyMap<string, GlobeMarker>,
): { points: GlobeMarker[]; cache: Map<string, GlobeMarker> } {
  const next = new Map<string, GlobeMarker>();
  const points = markers.map((marker) => {
    const key = `${marker.lat},${marker.lng},${marker.highlight ? 1 : 0},${marker.label}`;
    const point = next.get(key) ?? cache.get(key) ?? marker;
    next.set(key, point);
    return point;
  });
  return { points, cache: next };
}

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
//
// globe.gl redraws every frame forever, which keeps the GPU busy under the phone's sheet and pickers and
// competes with their animations. So it only runs while something is moving it (see wake()) and sleeps after,
// leaving the last frame on screen.
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
  /**
   * Start (and reset) zoomed so the globe spans this share (0–1) of the view's narrower side, like the
   * phone layout's near-full-width globe. Unset: a fixed altitude that suits a wide desktop view.
   */
  readonly fill = input<number | null>(null);
  readonly countryClick = output<string>();

  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');

  private readonly canvasHost = viewChild.required<ElementRef<HTMLElement>>('canvasHost');
  private readonly probe = viewChild.required<ElementRef<HTMLElement>>('probe');
  private readonly theme = inject(ThemeService);
  private readonly globe = signal<GlobeInstance | null>(null);
  private readonly size = signal<Size>({ width: 0, height: 0 });
  private shift = 0; // px the picture is currently slid left
  private slideFrame = 0;
  private loop: IdleLoop | undefined;
  private borders: BorderLines | undefined;
  /** The marker objects last given to the globe, by content: unchanged markers keep their 3D object */
  private pointCache = new Map<string, GlobeMarker>();

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.loop?.stop());

    afterNextRender(async () => {
      try {
        // Together: border-lines brings three.js, which only belongs in this lazy chunk
        const [{ default: Globe }, { BorderLines }] = await Promise.all([
          import('globe.gl'),
          import('./border-lines'),
        ]);
        if (destroyRef.destroyed) return;
        const host = this.canvasHost().nativeElement;
        const dpr = window.devicePixelRatio || 1;
        const globe = new Globe(host, {
          animateIn: false,
          // Anti-aliasing everywhere: without it thin lines (borders, grid) shimmer as the globe turns on
          // phones and tablets. Affordable since the borders became one draw call.
          rendererConfig: { antialias: true, powerPreference: 'high-performance' },
        })
          .showGraticules(true)
          .atmosphereAltitude(0.12)
          .polygonAltitude((d) => this.altitudeOf(d as CountryShape))
          .polygonsTransitionDuration(POLYGONS_MS)
          .polygonLabel((d) => escapeHtml((d as CountryShape).properties.name))
          .onPolygonClick((d) => this.countryClick.emit((d as CountryShape).properties.iso))
          .pointLat('lat')
          .pointLng('lng')
          .pointAltitude(0.02)
          .pointRadius((d) => ((d as GlobeMarker).highlight ? 0.8 : 0.45))
          .pointLabel((d) => escapeHtml((d as GlobeMarker).label))
          .pointOfView({ altitude: DEFAULT_ALTITUDE });
        // Kept through resizes: setSize() multiplies by whatever ratio was set
        globe.renderer().setPixelRatio(Math.min(MAX_PIXEL_RATIO, dpr));
        // All borders in one object instead of globe.gl's stroke per country (see country-borders.ts)
        const borders = new BorderLines();
        globe.scene().add(borders.object);
        this.borders = borders;

        const resize = new ResizeObserver(([entry]) => {
          const { width, height } = entry.contentRect;
          globe.width(width).height(height);
          this.size.set({ width, height });
          this.wake(globe); // a resize clears the canvas, so it needs a frame drawn
        });
        resize.observe(host);

        // Anything the user does to the globe: drag, scroll-zoom, hover (tooltips are found per frame).
        // Passive: these only keep it drawing, the controls handle the gestures themselves.
        const wakeOnInput = () => this.wake(globe);
        const inputs = ['pointerdown', 'pointermove', 'wheel', 'touchstart'] as const;
        for (const type of inputs) host.addEventListener(type, wakeOnInput, { passive: true });
        // And the spin coasting on after a drag: the controls report each step of it
        globe.controls().addEventListener('change', wakeOnInput);

        destroyRef.onDestroy(() => {
          resize.disconnect();
          for (const type of inputs) host.removeEventListener(type, wakeOnInput);
          borders.dispose();
          globe._destructor();
        });

        this.globe.set(globe);
        this.status.set('ready');
        this.wake(globe);
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
      const highlight = color('--mat-sys-primary');
      globe
        .backgroundColor('rgba(0,0,0,0)')
        .atmosphereColor(ocean)
        .polygonCapColor((d) => (this.isVisited(d) ? visited : land))
        // Each country with sides or a stroke is another draw call per frame. Sides only where they show (an
        // unvisited country is too low for its sides to be seen); no strokes, the borders object draws them.
        .polygonSideColor((d) => (this.isVisited(d) ? line : ''))
        .polygonStrokeColor(() => null)
        .pointColor((d) => ((d as GlobeMarker).highlight ? highlight : marker));
      this.borders?.setColor(line);
      // The sphere itself is a three.js MeshPhongMaterial; tint it to the ocean colour (no texture image)
      (globe.globeMaterial() as unknown as { color: { set(c: string): void } }).color.set(ocean);
      untracked(() => this.wake(globe));
    });

    // Countries: re-run the accessors (polygonsData with the same array still re-evaluates colours).
    // Separate from the markers, so a marker change doesn't re-evaluate ~290 polygons.
    effect(() => {
      const globe = this.globe();
      const shapes = this.shapes();
      this.visitedCodes();
      if (!globe) return;
      globe.polygonsData([...shapes]);
      untracked(() => {
        this.borders?.update(borderPositions(shapes, (shape) => this.altitudeOf(shape)));
        this.wake(globe, POLYGONS_MS);
      });
    });

    // Markers. globe.gl matches data to its 3D objects by object identity, and the dashboard builds new
    // objects on every change (a trip added, a place picked), which would rebuild every marker and replay
    // its grow-in. So markers that haven't changed are passed as the same objects as last time.
    effect(() => {
      const globe = this.globe();
      const markers = this.markers();
      if (!globe) return;
      untracked(() => {
        globe.pointsData(this.stablePoints(markers));
        this.wake(globe, POINTS_MS);
      });
    });

    // With `fill`, the starting zoom depends on the view's size, known only once it's laid out. Done once:
    // after that the zoom is the user's (or a focus request's).
    let fitted = false;
    effect(() => {
      const globe = this.globe();
      const { width } = this.size();
      if (!globe || !width || fitted || !this.fill()) return;
      fitted = true;
      untracked(() => {
        if (!this.focus()) globe.pointOfView({ altitude: this.homeAltitude(globe) });
        this.wake(globe);
      });
    });

    // Fly to each focus request (also one made before the globe finished loading)
    effect(() => {
      const globe = this.globe();
      const focus = this.focus();
      if (!globe || !focus) return;
      untracked(() => this.wake(globe, FLY_MS));
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

  private wake(globe: GlobeInstance, busyMs = 0): void {
    this.loop ??= new IdleLoop(
      () => globe.pauseAnimation(),
      () => globe.resumeAnimation(),
      IDLE_MS,
    );
    this.loop.wake(busyMs);
  }

  private stablePoints(markers: readonly GlobeMarker[]): GlobeMarker[] {
    const { points, cache } = reuseMarkers(markers, this.pointCache);
    this.pointCache = cache;
    return points;
  }

  // Eases the view offset from where it is now to `target` (a resize mid-slide just continues from there).
  // The globe is kept awake for the slide, so each step only has to update the camera.
  private slideTo(globe: GlobeInstance, target: number, { width, height }: Size): void {
    cancelAnimationFrame(this.slideFrame);
    this.wake(globe, SLIDE_MS);
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
      apply(slideStep(from, target, t));
      if (t < 1) this.slideFrame = requestAnimationFrame(step);
    };
    this.slideFrame = requestAnimationFrame(step);
  }

  protected zoom(factor: number): void {
    const globe = this.globe();
    if (!globe) return;
    const { altitude } = globe.pointOfView();
    this.wake(globe, 300);
    globe.pointOfView({ altitude: Math.min(6, Math.max(0.4, altitude * factor)) }, 300);
  }

  protected resetView(): void {
    const globe = this.globe();
    if (!globe) return;
    this.wake(globe, 600);
    globe.pointOfView({ lat: 20, lng: 0, altitude: this.homeAltitude(globe) }, 600);
  }

  private homeAltitude(globe: GlobeInstance): number {
    const fill = this.fill();
    const { width, height } = this.size();
    if (!fill || !width || !height) return DEFAULT_ALTITUDE;
    const fov = (globe.camera() as unknown as { fov: number }).fov;
    return altitudeToFit(width, height, fill, fov);
  }

  private altitudeOf(shape: CountryShape): number {
    return this.isVisited(shape) ? VISITED_ALTITUDE : LAND_ALTITUDE;
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
