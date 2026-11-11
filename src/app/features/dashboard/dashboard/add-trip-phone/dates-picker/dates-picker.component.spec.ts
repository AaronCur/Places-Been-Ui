import { TestBed } from '@angular/core/testing';
import { NOW } from '../../../../../core/dates/day-first-date-adapter';
import { DatesPickerComponent, TripDates } from './dates-picker.component';

// "Today" in these tests: Wednesday 11 November 2026
const TODAY = new Date(2026, 10, 11, 10, 30);

describe('DatesPickerComponent', () => {
  let picked: TripDates[];
  let closed: number;

  async function render(value: TripDates | null = null) {
    picked = [];
    closed = 0;
    TestBed.configureTestingModule({ providers: [{ provide: NOW, useValue: () => TODAY }] });
    const fixture = TestBed.createComponent(DatesPickerComponent);
    fixture.componentRef.setInput('value', value);
    fixture.componentInstance.picked.subscribe((d) => picked.push(d));
    fixture.componentInstance.closed.subscribe(() => closed++);
    await fixture.whenStable();
    return fixture;
  }
  type Fixture = Awaited<ReturnType<typeof render>>;

  const el = (f: Fixture) => f.nativeElement as HTMLElement;
  const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  // Day cells are labelled like "12 October 2026" (the en-GB date adapter)
  const day = (f: Fixture, label: string) =>
    el(f).querySelector(`.mat-calendar-body-cell[aria-label="${label}"]`) as HTMLElement;
  // The range as read: start, its label, the length between, end, its label (without the arrow icon)
  const range = (f: Fixture) =>
    [...el(f).querySelectorAll('.range .value, .range .label, .range .length span')]
      .map(text)
      .filter(Boolean)
      .join(' ');
  const done = (f: Fixture) =>
    [...el(f).querySelectorAll<HTMLButtonElement>('.top-bar button')].find(
      (b) => text(b) === 'Done',
    )!;
  const monthHeadings = (f: Fixture) =>
    [...el(f).querySelectorAll('.month-heading')].map(
      (h) => `${text(h.querySelector('h3'))} ${text(h.querySelector('span'))}`,
    );

  async function tap(f: Fixture, label: string) {
    day(f, label).click();
    await f.whenStable();
  }

  it('opens on the latest months, then fills in the rest of the year above them', async () => {
    const f = await render();

    // Straight away: just the latest three, so the screen opens without a long freeze
    expect(monthHeadings(f)).toEqual(['September 2026', 'October 2026', 'November 2026']);
    expect(el(f).querySelector('.earlier')).toBeNull();

    await vi.waitFor(() => expect(monthHeadings(f)).toHaveLength(12), { timeout: 10_000 });
    expect(monthHeadings(f)[0]).toBe('December 2025');
    expect(monthHeadings(f).at(-1)).toBe('November 2026');
    // Twelve mat-calendars, rendered a few per tick: slow in jsdom during a full parallel run
  }, 15_000);

  it('goes further back on request', async () => {
    const f = await render();
    await vi.waitFor(() => expect(el(f).querySelector('.earlier')).not.toBeNull(), {
      timeout: 5000,
    });

    el(f).querySelector<HTMLElement>('.earlier')!.click();

    await vi.waitFor(() => expect(monthHeadings(f)).toHaveLength(24), { timeout: 10_000 });
    expect(monthHeadings(f)[0]).toBe('December 2024');
    // 24 mat-calendars: slow in jsdom, so more than the 5s default during a full parallel run
  }, 15_000);

  it('can’t pick a day after today', async () => {
    const f = await render();

    // Material marks only the disabled days
    expect(day(f, '11 November 2026').getAttribute('aria-disabled')).toBeNull();
    expect(day(f, '12 November 2026').getAttribute('aria-disabled')).toBe('true');
  });

  it('needs a start before Done', async () => {
    const f = await render();

    expect(done(f).disabled).toBe(true);
    expect(text(el(f).querySelector('.hint'))).toBe('Tap the day the trip started.');
  });

  it('takes the first tap as the start and the second as the end', async () => {
    const f = await render();

    await tap(f, '12 October 2026');
    expect(range(f)).toBe('12 Oct Start day trip Same day End');
    expect(text(el(f).querySelector('.hint'))).toBe('Tap the last day, or Done for a day trip.');

    await tap(f, '15 October 2026');
    expect(range(f)).toBe('12 Oct Start 3 nights 15 Oct End');

    done(f).click();
    expect(picked).toEqual([{ start: new Date(2026, 9, 12), end: new Date(2026, 9, 15) }]);
  });

  it('shows the range across both months of a trip that spans them', async () => {
    const f = await render();

    await tap(f, '29 October 2026');
    await tap(f, '2 November 2026');

    expect(day(f, '31 October 2026').classList).toContain('mat-calendar-body-in-range');
    expect(day(f, '1 November 2026').classList).toContain('mat-calendar-body-in-range');
    expect(range(f)).toContain('4 nights');
  });

  it('starts again from a day before the start, or from a third tap', async () => {
    const f = await render();

    await tap(f, '12 October 2026');
    await tap(f, '5 October 2026');
    expect(range(f)).toBe('5 Oct Start day trip Same day End');

    await tap(f, '7 October 2026');
    await tap(f, '20 October 2026');
    expect(range(f)).toBe('20 Oct Start day trip Same day End');
  });

  it('saves one day and Done as a day trip', async () => {
    const f = await render();

    await tap(f, '3 November 2026');
    await tap(f, '3 November 2026'); // the same day again changes nothing
    done(f).click();

    expect(picked).toEqual([{ start: new Date(2026, 10, 3), end: null }]);
  });

  it('opens on the dates already chosen, however long ago, with the year shown', async () => {
    const f = await render({ start: new Date(2025, 6, 10), end: new Date(2025, 6, 12) });

    // Rendered at once from that month on, rather than filled in later
    expect(monthHeadings(f)[0]).toBe('July 2025');
    expect(range(f)).toBe('10 Jul Start · 2025 2 nights 12 Jul End');
    expect(day(f, '11 July 2025').classList).toContain('mat-calendar-body-in-range');
  });

  it('goes back without picking', async () => {
    const f = await render();
    await tap(f, '12 October 2026');

    el(f).querySelector<HTMLElement>('[aria-label="Back"]')!.click();

    expect(closed).toBe(1);
    expect(picked).toEqual([]);
  });
});
