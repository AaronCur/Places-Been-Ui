import { Injectable, InjectionToken, Provider } from '@angular/core';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  MAT_NATIVE_DATE_FORMATS,
  NativeDateAdapter,
} from '@angular/material/core';

// D/M/YYYY, also with - or . between the parts
const DAY_FIRST = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/;

/**
 * Material's NativeDateAdapter parses typed text with Date.parse, which reads "12/10/2026" US style, as
 * 10 December. This one reads digits day first to match how dates are shown (en-GB); anything else (such as
 * "12 Oct 2026") still goes to Date.parse.
 */
@Injectable()
export class DayFirstDateAdapter extends NativeDateAdapter {
  override parse(value: unknown, parseFormat?: unknown): Date | null {
    if (typeof value === 'string') {
      const match = DAY_FIRST.exec(value);
      if (match) {
        const [day, month, year] = match.slice(1).map(Number);
        const date = new Date(year, month - 1, day);
        // new Date() rolls 31/02 over to 3 March; treat that as a typo, not a date
        return date.getDate() === day && date.getMonth() === month - 1 ? date : this.invalid();
      }
    }
    return super.parse(value, parseFormat);
  }
}

/**
 * Datepicker providers: native Date values, shown and typed as DD/MM/YYYY. Given to the components that use a
 * datepicker rather than app-wide, so the adapter stays in their lazy chunks.
 */
export function provideDayFirstDates(): Provider[] {
  return [
    { provide: DateAdapter, useClass: DayFirstDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: MAT_NATIVE_DATE_FORMATS },
    { provide: MAT_DATE_LOCALE, useValue: 'en-GB' },
  ];
}

/** The current date and time; a token so tests can fix "today" (a calendar's future days, its months) */
export const NOW = new InjectionToken<() => Date>('NOW', { factory: () => () => new Date() });

/**
 * The API's LocalDate format ("2026-10-12"), from the date's local day. Not toISOString(): that converts to
 * UTC first, so east of UTC midnight on 12 Oct would be sent as 11 Oct.
 */
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
