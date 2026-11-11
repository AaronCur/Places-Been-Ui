import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  model,
  untracked,
  viewChild,
} from '@angular/core';

// How far a finger moves before it counts as a drag rather than a tap (px)
const DRAG_THRESHOLD = 6;
// A release faster than this (px/ms) snaps in the direction of the flick, wherever the sheet is
const FLICK_SPEED = 0.5;
// Held still for longer than this before letting go: not a flick (ms)
const STILL_MS = 100;

/** One drag, from the first touch to the release */
interface Gesture {
  startY: number;
  /** The sheet's offset from the top when the drag began: 0 expanded, `peek` collapsed */
  startOffset: number;
  peek: number;
  /** Started inside the scrolling content (not on the handle) */
  inContent: boolean;
  dragging: boolean;
  offset: number;
  // The last two moves, for the release speed
  lastY: number;
  lastTime: number;
  speed: number;
}

/**
 * A bottom sheet that stays on screen and can be dragged between two positions, like the panel in a banking
 * app: collapsed (its top at the host's `--sheet-peek`, showing the start of its content) and expanded
 * (filling the host). The handle toggles it with a tap or the keyboard.
 *
 * The content only scrolls when expanded. Pulling down while it's scrolled to the top drags the sheet down
 * instead, so one gesture goes from reading the list back to the globe.
 *
 * MatBottomSheet isn't used because it's modal (a backdrop, closes on outside clicks) and can't be dragged;
 * CDK has no sheet either. Placed by its parent: give the host a size (e.g. `position: absolute; inset: 0`)
 * and `--sheet-peek`.
 */
@Component({
  selector: 'app-drag-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './drag-sheet.component.html',
  styleUrl: './drag-sheet.component.css',
  host: { '[class.expanded]': 'expanded()' },
})
export class DragSheetComponent {
  readonly expanded = model(false);
  /** Accessible name of the sheet region */
  readonly label = input.required<string>();

  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheet');
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');
  private readonly peekProbe = viewChild.required<ElementRef<HTMLElement>>('peekProbe');
  private gesture: Gesture | null = null;
  // A drag ends with a click on whatever it started on (a list row); that click is swallowed
  private suppressClick = false;

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Collapsing shows the start of the content again (the stats), not wherever the list was scrolled to
    effect(() => {
      if (!this.expanded()) untracked(() => (this.content().nativeElement.scrollTop = 0));
    });

    // Listeners added by hand rather than with (touchmove): the move handler has to call preventDefault() to
    // stop the content scrolling while the sheet is dragged, which needs a non-passive listener, and Angular
    // can't mark one as such. Touch and mouse are separate because a browser that starts scrolling the
    // content sends pointercancel and stops sending pointer events, while touch events keep coming.
    afterNextRender(() => {
      const sheet = this.sheet().nativeElement;
      const listen = <K extends keyof HTMLElementEventMap>(
        target: EventTarget,
        type: K,
        handler: (event: HTMLElementEventMap[K]) => void,
        options: AddEventListenerOptions = {},
      ) => {
        target.addEventListener(type, handler as EventListener, options);
        destroyRef.onDestroy(() =>
          target.removeEventListener(type, handler as EventListener, options),
        );
      };

      listen(sheet, 'touchstart', (e) => this.start(e.touches[0].clientY, e.target), {
        passive: true,
      });
      listen(sheet, 'touchmove', (e) => this.move(e.touches[0].clientY, e), { passive: false });
      listen(sheet, 'touchend', () => this.end());
      listen(sheet, 'touchcancel', () => this.end());

      // A mouse (a narrow desktop window, or a laptop with a touch screen used with its trackpad)
      listen(sheet, 'pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        this.start(e.clientY, e.target);
        const move = (m: PointerEvent) => this.move(m.clientY, m);
        const up = () => {
          this.end();
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });

      listen(
        sheet,
        'click',
        (e) => {
          if (!this.suppressClick) return;
          this.suppressClick = false;
          e.stopPropagation();
          e.preventDefault();
        },
        { capture: true },
      );
    });
  }

  protected toggle(): void {
    this.expanded.update((expanded) => !expanded);
  }

  private start(y: number, target: EventTarget | null): void {
    const peek = this.peekProbe().nativeElement.offsetTop;
    const startOffset = this.expanded() ? 0 : peek;
    this.suppressClick = false;
    this.gesture = {
      startY: y,
      startOffset,
      peek,
      inContent: this.content().nativeElement.contains(target as Node),
      dragging: false,
      offset: startOffset,
      lastY: y,
      lastTime: performance.now(),
      speed: 0,
    };
  }

  private move(y: number, event: Event): void {
    const g = this.gesture;
    if (!g) return;
    const dy = y - g.startY;

    if (!g.dragging) {
      if (Math.abs(dy) < DRAG_THRESHOLD) return;
      // Expanded, the content scrolls: leave it to the browser unless this pulls down from the very top
      const scrolledDown = this.content().nativeElement.scrollTop > 0;
      if (this.expanded() && g.inContent && (scrolledDown || dy < 0)) {
        this.gesture = null;
        return;
      }
      g.dragging = true;
      this.sheet().nativeElement.classList.add('dragging');
    }

    if (event.cancelable) event.preventDefault();
    const now = performance.now();
    if (now > g.lastTime) g.speed = (y - g.lastY) / (now - g.lastTime);
    g.lastY = y;
    g.lastTime = now;
    g.offset = Math.min(g.peek, Math.max(0, g.startOffset + dy));
    // Straight to the element: a change detection run per frame of a drag would be wasted work
    this.sheet().nativeElement.style.transform = `translateY(${g.offset}px)`;
  }

  private end(): void {
    const g = this.gesture;
    this.gesture = null;
    if (!g?.dragging) return;

    const sheet = this.sheet().nativeElement;
    sheet.classList.remove('dragging');
    sheet.style.transform = ''; // the expanded/collapsed CSS takes over, and animates the rest of the way
    // A mouse drag's click follows straight after; a touch drag has none, so don't wait for one
    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false));
    // A finger that stopped before letting go isn't flicking, however fast it moved before
    const speed = performance.now() - g.lastTime > STILL_MS ? 0 : g.speed;
    this.expanded.set(
      speed <= -FLICK_SPEED ? true : speed >= FLICK_SPEED ? false : g.offset < g.peek / 2,
    );
  }
}
