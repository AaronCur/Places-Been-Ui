import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { DateRange, MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { NOW, provideDayFirstDates } from '../../../../../core/dates/day-first-date-adapter';

/** The chosen dates; no end is a day trip */
export interface TripDates {
  start: Date;
  end: Date | null;
}

// Months shown at first, and added by each "Show earlier months"
const MONTHS_PER_PAGE = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const firstOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthsBetween = (from: Date, to: Date) =>
  (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();

/** mat-calendar's own header (month name and arrows) is replaced by ours above each month */
@Component({ selector: 'app-no-calendar-header', template: '' })
export class NoCalendarHeader {}

/**
 * When the trip was, as a full-screen range calendar (Material's mobile date range picker): months scroll
 * down to the current one, a tap sets the start and a second the end. One day and Done is a day trip.
 *
 * Each month is a mat-calendar given the same DateRange, so the range shows across months; the picking
 * itself is done here (selectedChange only reports the tapped day). Days after today are disabled, as a
 * trip can't start in the future.
 */
@Component({
  selector: 'app-dates-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatDatepickerModule, MatIconModule],
  providers: [provideDayFirstDates()],
  templateUrl: './dates-picker.component.html',
  styleUrl: './dates-picker.component.css',
})
export class DatesPickerComponent {
  private injector = inject(Injector);
  protected readonly today = startOfDay(inject(NOW)());

  /** The dates already chosen, if any: the calendar starts from them */
  readonly value = input<TripDates | null>(null);
  readonly picked = output<TripDates>();
  /** Back without changing the dates */
  readonly closed = output<void>();

  protected readonly start = linkedSignal(() => this.value()?.start ?? null);
  protected readonly end = linkedSignal(() => this.value()?.end ?? null);

  protected readonly headerComponent = NoCalendarHeader;
  protected readonly selected = computed(() => new DateRange(this.start(), this.end()));

  private readonly extraPages = signal(0);
  /** Oldest first, ending with this month; far enough back to include the chosen start */
  protected readonly months = computed(() => {
    const start = this.start();
    const reach = start ? monthsBetween(start, this.today) + 1 : 0;
    const count = Math.max(MONTHS_PER_PAGE, reach) + this.extraPages() * MONTHS_PER_PAGE;
    const thisMonth = firstOfMonth(this.today);
    return Array.from(
      { length: count },
      (_, i) => new Date(thisMonth.getFullYear(), thisMonth.getMonth() - (count - 1 - i), 1),
    );
  });

  protected readonly nights = computed(() => {
    const start = this.start();
    const end = this.end();
    return start && end ? Math.round((end.getTime() - start.getTime()) / DAY_MS) : 0;
  });

  protected readonly hint = computed(() =>
    !this.start()
      ? 'Tap the day the trip started.'
      : !this.end()
        ? 'Tap the last day, or Done for a day trip.'
        : 'Tap another day to start again.',
  );

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  constructor() {
    // Open on the latest months, like a chat: the past is above
    afterNextRender(() => {
      const el = this.scroller().nativeElement;
      const target = el.querySelector<HTMLElement>('[data-start-month]');
      el.scrollTop = target ? target.offsetTop - el.offsetTop - 16 : el.scrollHeight;
    });
  }

  /** First tap: the start. Second: the end (a day before the start starts again). Third: start again. */
  protected pick(day: Date | null): void {
    if (!day) return;
    const start = this.start();
    if (!start || this.end() || day < start) {
      this.start.set(day);
      this.end.set(null);
    } else if (day > start) {
      this.end.set(day);
    }
  }

  protected isStartMonth(month: Date): boolean {
    const start = this.start();
    return !!start && monthsBetween(month, start) === 0;
  }

  protected showEarlier(): void {
    const el = this.scroller().nativeElement;
    const fromBottom = el.scrollHeight - el.scrollTop;
    this.extraPages.update((n) => n + 1);
    // Keep the months in view where they were, rather than jumping as the new ones push them down
    afterNextRender(() => (el.scrollTop = el.scrollHeight - fromBottom), {
      injector: this.injector,
    });
  }

  protected done(): void {
    const start = this.start();
    if (start) this.picked.emit({ start, end: this.end() });
  }
}
