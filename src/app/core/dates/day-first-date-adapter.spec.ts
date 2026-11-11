import { TestBed } from '@angular/core/testing';
import { DateAdapter } from '@angular/material/core';
import { provideDayFirstDates, toIsoDate } from './day-first-date-adapter';

describe('DayFirstDateAdapter', () => {
  let adapter: DateAdapter<Date>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideDayFirstDates() });
    adapter = TestBed.inject(DateAdapter);
  });

  const parsed = (text: string) => {
    const date = adapter.parse(text, null);
    return date && adapter.isValid(date) ? toIsoDate(date) : 'invalid';
  };

  it('reads typed digits day first', () => {
    expect(parsed('12/10/2026')).toBe('2026-10-12');
    expect(parsed('1/2/2026')).toBe('2026-02-01');
    expect(parsed(' 03-04-2026 ')).toBe('2026-04-03');
    expect(parsed('03.04.2026')).toBe('2026-04-03');
  });

  it('rejects days that don’t exist instead of rolling them over', () => {
    expect(parsed('31/02/2026')).toBe('invalid');
    expect(parsed('12/13/2026')).toBe('invalid');
  });

  it('still understands written-out dates', () => {
    expect(parsed('12 Oct 2026')).toBe('2026-10-12');
  });

  it('shows dates day first', () => {
    expect(
      adapter.format(new Date(2026, 9, 12), { year: 'numeric', month: '2-digit', day: '2-digit' }),
    ).toBe('12/10/2026');
  });
});

describe('toIsoDate', () => {
  it('uses the local day, padded', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toIsoDate(new Date(2026, 9, 12, 23, 59))).toBe('2026-10-12');
  });
});
