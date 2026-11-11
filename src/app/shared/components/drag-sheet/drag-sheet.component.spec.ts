import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DragSheetComponent } from './drag-sheet.component';

const PEEK = 400;

@Component({
  imports: [DragSheetComponent],
  template: `
    <app-drag-sheet label="Places visited" [(expanded)]="expanded">
      <button type="button" class="row" (click)="clicks = clicks + 1">Italy</button>
    </app-drag-sheet>
  `,
})
class Host {
  readonly expanded = signal(false);
  clicks = 0;
}

describe('DragSheetComponent', () => {
  let now = 0;

  async function render(expanded = false) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.expanded.set(expanded);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    // jsdom has no layout: say where the collapsed sheet's top is, as the browser would from --sheet-peek
    Object.defineProperty(el.querySelector('.peek-probe'), 'offsetTop', { get: () => PEEK });
    return fixture;
  }
  type Fixture = Awaited<ReturnType<typeof render>>;

  const sheet = (f: Fixture) => f.nativeElement.querySelector('.sheet') as HTMLElement;
  const content = (f: Fixture) => f.nativeElement.querySelector('.content') as HTMLElement;
  const handle = (f: Fixture) => f.nativeElement.querySelector('.handle') as HTMLButtonElement;
  const row = (f: Fixture) => f.nativeElement.querySelector('.row') as HTMLElement;

  // A finger: jsdom has no Touch constructor, so the events carry plain objects with clientY
  function touch(target: HTMLElement, type: string, y: number) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientY: y }] });
    target.dispatchEvent(event);
    return event;
  }

  /** Moves a finger from `from` to `to` in steps of `ms`, then lets go after `holdMs` */
  async function swipe(
    f: Fixture,
    target: HTMLElement,
    from: number,
    to: number,
    ms = 50,
    holdMs = 0,
  ) {
    touch(target, 'touchstart', from);
    const steps = 4;
    for (let i = 1; i <= steps; i++) {
      now += ms;
      touch(target, 'touchmove', from + ((to - from) * i) / steps);
    }
    now += holdMs;
    touch(target, 'touchend', to);
    await f.whenStable();
  }

  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => vi.restoreAllMocks());

  it('starts collapsed with a handle that says so', async () => {
    const f = await render();

    expect(f.nativeElement.querySelector('app-drag-sheet').classList).not.toContain('expanded');
    expect(handle(f).getAttribute('aria-expanded')).toBe('false');
    expect(handle(f).getAttribute('aria-label')).toBe('Expand list');
    expect(sheet(f).getAttribute('aria-label')).toBe('Places visited');
  });

  it('toggles with a tap (or Enter) on the handle', async () => {
    const f = await render();

    handle(f).click();
    await f.whenStable();
    expect(f.componentInstance.expanded()).toBe(true);
    expect(handle(f).getAttribute('aria-label')).toBe('Collapse list');

    handle(f).click();
    await f.whenStable();
    expect(f.componentInstance.expanded()).toBe(false);
  });

  it('follows the finger while dragged', async () => {
    const f = await render();

    touch(row(f), 'touchstart', 500);
    touch(row(f), 'touchmove', 400);

    expect(sheet(f).style.transform).toBe('translateY(300px)');
    expect(sheet(f).classList).toContain('dragging');
  });

  it('expands when dragged more than halfway up, and snaps back when not', async () => {
    const f = await render();

    await swipe(f, row(f), 500, 420, 100, 200); // slow and short
    expect(f.componentInstance.expanded()).toBe(false);
    expect(sheet(f).style.transform).toBe('');

    await swipe(f, row(f), 500, 250, 100, 200); // slow but past halfway
    expect(f.componentInstance.expanded()).toBe(true);
  });

  it('goes with a flick, however short', async () => {
    const f = await render();

    await swipe(f, row(f), 500, 440, 10); // 60px in 40ms
    expect(f.componentInstance.expanded()).toBe(true);
  });

  it('does not take a tap as a drag', async () => {
    const f = await render();

    await swipe(f, row(f), 500, 497);
    expect(f.componentInstance.expanded()).toBe(false);
    expect(sheet(f).classList).not.toContain('dragging');
  });

  it('when expanded, lets the content scroll instead of dragging', async () => {
    const f = await render(true);

    // Scrolling down the list (finger moving up) is the browser's
    touch(row(f), 'touchstart', 500);
    expect(touch(row(f), 'touchmove', 450).defaultPrevented).toBe(false);
    touch(row(f), 'touchend', 450);

    // So is scrolling back up while the list isn't at the top
    content(f).scrollTop = 120;
    await swipe(f, row(f), 200, 600, 10);
    expect(f.componentInstance.expanded()).toBe(true);
  });

  it('when expanded and scrolled to the top, pulling down drags the sheet back down', async () => {
    const f = await render(true);

    touch(row(f), 'touchstart', 100);
    const move = touch(row(f), 'touchmove', 300);
    expect(move.defaultPrevented).toBe(true); // the content doesn't scroll as well
    now += 50;
    touch(row(f), 'touchend', 300);
    await f.whenStable();

    expect(f.componentInstance.expanded()).toBe(false);
  });

  it('can always be dragged by the handle', async () => {
    const f = await render(true);
    content(f).scrollTop = 120;

    await swipe(f, handle(f), 10, 380, 10);

    expect(f.componentInstance.expanded()).toBe(false);
  });

  it('shows the start of the content again when it collapses', async () => {
    const f = await render(true);
    content(f).scrollTop = 300;

    f.componentInstance.expanded.set(false);
    await f.whenStable();

    expect(content(f).scrollTop).toBe(0);
  });

  it('swallows the click that ends a mouse drag, but not the next one', async () => {
    const f = await render();
    const pointer = (target: EventTarget, type: string, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientY: y, button: 0 });
      Object.defineProperty(event, 'pointerType', { value: 'mouse' });
      target.dispatchEvent(event);
    };

    pointer(row(f), 'pointerdown', 500);
    pointer(window, 'pointermove', 250); // past halfway
    pointer(window, 'pointerup', 250);
    row(f).click(); // the browser's click after the mouse is released
    await f.whenStable();

    expect(f.componentInstance.expanded()).toBe(true);
    expect(f.componentInstance.clicks).toBe(0);

    await new Promise((resolve) => setTimeout(resolve));
    row(f).click();
    expect(f.componentInstance.clicks).toBe(1);
  });
});
