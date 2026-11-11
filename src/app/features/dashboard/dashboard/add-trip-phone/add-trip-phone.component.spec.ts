import { Component, input, model, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlatformLocation } from '@angular/common';
import { MockPlatformLocation } from '@angular/common/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AddTripPhoneComponent, describeDates } from './add-trip-phone.component';
import { DatesPickerComponent, TripDates } from './dates-picker/dates-picker.component';
import { PickerStep, PlacePickerComponent } from './place-picker/place-picker.component';
import { VisitedCountry } from './visited';
import { PickedPlace } from '../add-trip-shared/trip-form';
import { MapFocusService } from '../../../../core/services/map-focus.service';
import { TripService } from '../../../../core/services/trip.service';
import { TripRequest, TripResponse } from '../../../../core/models/trip.model';

// The pickers have their own tests; here they're stand-ins the tests drive directly
@Component({ selector: 'app-place-picker', template: '' })
class FakePlacePicker {
  readonly visited = input<readonly VisitedCountry[]>([]);
  readonly step = model<PickerStep>('countries');
  readonly picked = output<PickedPlace>();
  readonly closed = output<void>();
}

@Component({ selector: 'app-dates-picker', template: '' })
class FakeDatesPicker {
  readonly value = input<TripDates | null>(null);
  readonly picked = output<TripDates>();
  readonly closed = output<void>();
}

const rome: PickedPlace = {
  countryCode: 'IT',
  countryName: 'Italy',
  cityName: 'Rome',
  state: 'Lazio',
  latitude: 41.9,
  longitude: 12.5,
  approximate: false,
};
const october: TripDates = { start: new Date(2026, 9, 12), end: new Date(2026, 9, 15) };
const created = { id: 9, city: { name: 'Rome' } } as TripResponse;

describe('AddTripPhoneComponent', () => {
  let addTrip: (request: TripRequest) => Observable<TripResponse>;
  let sent: TripRequest[];
  let dialogRef: { close: ReturnType<typeof vi.fn>; keydownEvents: () => Subject<KeyboardEvent> };
  let keys: Subject<KeyboardEvent>;
  let history: MockPlatformLocation;

  beforeEach(() => {
    sent = [];
    addTrip = (request) => {
      sent.push(request);
      return of(created);
    };
  });

  async function render() {
    keys = new Subject();
    dialogRef = { close: vi.fn(), keydownEvents: () => keys };
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { visited: [] } },
        { provide: TripService, useValue: { addTrip: (r: TripRequest) => addTrip(r) } },
        { provide: PlatformLocation, useClass: MockPlatformLocation },
      ],
    }).overrideComponent(AddTripPhoneComponent, {
      remove: { imports: [PlacePickerComponent, DatesPickerComponent] },
      add: { imports: [FakePlacePicker, FakeDatesPicker] },
    });
    history = TestBed.inject(PlatformLocation) as MockPlatformLocation;
    const fixture = TestBed.createComponent(AddTripPhoneComponent);
    await fixture.whenStable();
    return fixture;
  }
  type Fixture = Awaited<ReturnType<typeof render>>;

  const el = (f: Fixture) => f.nativeElement as HTMLElement;
  const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const button = (f: Fixture, label: string) =>
    [...el(f).querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.getAttribute('aria-label') === label || text(b).startsWith(label),
    )!;
  const row = (f: Fixture, label: 'Where' | 'When' | 'Notes') =>
    [...el(f).querySelectorAll<HTMLElement>('.row')].find((r) =>
      text(r.querySelector('.row-label')).startsWith(label),
    )!;
  const picker = (f: Fixture) =>
    f.debugElement.query((d) => d.componentInstance instanceof FakePlacePicker)
      ?.componentInstance as FakePlacePicker;
  const datesPicker = (f: Fixture) =>
    f.debugElement.query((d) => d.componentInstance instanceof FakeDatesPicker)
      ?.componentInstance as FakeDatesPicker;

  async function click(f: Fixture, target: HTMLElement) {
    target.click();
    await f.whenStable();
  }

  async function pickPlace(f: Fixture, place = rome) {
    await click(f, row(f, 'Where'));
    picker(f).picked.emit(place);
    await f.whenStable();
  }

  async function pickDates(f: Fixture, dates = october) {
    await click(f, row(f, 'When'));
    datesPicker(f).picked.emit(dates);
    await f.whenStable();
  }

  it('asks where first, with Save off until there’s a place and dates', async () => {
    const f = await render();

    expect(text(el(f).querySelector('h2'))).toBe('Where did you go?');
    expect(text(row(f, 'Where'))).toContain('Pick a place');
    expect(text(row(f, 'When'))).toContain('Add dates');
    expect(button(f, 'Save trip').disabled).toBe(true);

    await pickPlace(f);
    expect(button(f, 'Save trip').disabled).toBe(true);
    expect(text(el(f).querySelector('.headline p'))).toBe('Now, when was it?');

    await pickDates(f);
    expect(button(f, 'Save trip').disabled).toBe(false);
  });

  it('opens each picker full screen and comes back to the summary with the choice', async () => {
    const f = await render();

    await click(f, row(f, 'Where'));
    expect(picker(f)).toBeDefined();
    expect(el(f).querySelector('.panel')).toBeNull();

    picker(f).picked.emit(rome);
    await f.whenStable();

    expect(text(el(f).querySelector('h2'))).toBe('Rome');
    expect(text(el(f).querySelector('.country'))).toBe('Italy');
    expect(text(row(f, 'Where'))).toContain('Rome, Italy');
    expect(row(f, 'Where').querySelector('.row-icon.done')).not.toBeNull();
  });

  it('flies the globe to the picked place and pins it until the dialog goes', async () => {
    const f = await render();
    const focus = TestBed.inject(MapFocusService);

    await pickPlace(f);

    expect(focus.target()).toEqual({ lat: 41.9, lng: 12.5, altitude: 0.6 });
    expect(focus.pin()).toEqual({ lat: 41.9, lng: 12.5, label: 'Rome, Italy' });

    f.destroy();
    expect(focus.pin()).toBeNull();
  });

  it('says when a typed place is pinned at its country’s centre', async () => {
    const f = await render();

    await pickPlace(f, { ...rome, cityName: 'Cinque Terre', state: null, approximate: true });

    expect(text(row(f, 'Where'))).toContain('Pinned at the centre of Italy');
  });

  it('shows the dates in the summary and passes them back when reopened', async () => {
    const f = await render();

    await pickDates(f);
    expect(text(row(f, 'When'))).toContain('12–15 Oct 2026');
    expect(text(el(f).querySelector('.headline p'))).toBe(
      'Pick a place and the dates to save the trip.',
    );

    await click(f, row(f, 'When'));
    expect(datesPicker(f).value()).toEqual(october);
  });

  it('takes notes on their own screen, with a counter', async () => {
    const f = await render();
    await click(f, row(f, 'Notes'));
    const box = el(f).querySelector('textarea') as HTMLTextAreaElement;

    box.value = 'Carbonara at Da Enzo';
    box.dispatchEvent(new Event('input'));
    await f.whenStable();
    expect(text(el(f).querySelector('.count'))).toBe('20 / 2000');
    expect(box.maxLength).toBe(2000);

    await click(f, button(f, 'Done'));
    expect(text(row(f, 'Notes'))).toContain('Carbonara at Da Enzo');
  });

  it('saves the trip and closes with it', async () => {
    const f = await render();
    await pickPlace(f);
    await pickDates(f);
    await click(f, row(f, 'Notes'));
    const box = el(f).querySelector('textarea') as HTMLTextAreaElement;
    box.value = ' Pasta ';
    box.dispatchEvent(new Event('input'));
    await click(f, button(f, 'Done'));

    await click(f, button(f, 'Save trip'));

    expect(sent).toEqual([
      {
        cityName: 'Rome',
        state: 'Lazio',
        countryCode: 'IT',
        latitude: 41.9,
        longitude: 12.5,
        startDate: '2026-10-12',
        endDate: '2026-10-15',
        notes: 'Pasta',
      },
    ]);
    expect(dialogRef.close).toHaveBeenCalledWith(created);
  });

  it('saves a day trip without notes as nulls', async () => {
    const f = await render();
    await pickPlace(f);
    await pickDates(f, { start: new Date(2026, 10, 3), end: null });
    expect(text(row(f, 'When'))).toContain('3 Nov 2026 · day trip');

    await click(f, button(f, 'Save trip'));

    expect(sent).toEqual([expect.objectContaining({ endDate: null, notes: null })]);
  });

  it('puts the API’s field errors on the row they’re about', async () => {
    addTrip = () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { message: 'endDate: End date must be on or after the start date' },
          }),
      );
    const f = await render();
    await pickPlace(f);
    await pickDates(f);

    await click(f, button(f, 'Save trip'));

    expect(text(row(f, 'When').querySelector('.row-error'))).toBe(
      'The end can’t be before the start',
    );
    expect(row(f, 'When').classList).toContain('error');
    expect(dialogRef.close).not.toHaveBeenCalled();

    // Picking new dates clears it
    await pickDates(f);
    expect(row(f, 'When').querySelector('.row-error')).toBeNull();
  });

  it('shows other failures above the rows and lets the user try again', async () => {
    const response = new Subject<TripResponse>();
    addTrip = () => response;
    const f = await render();
    await pickPlace(f);
    await pickDates(f);

    await click(f, button(f, 'Save trip'));
    expect(text(button(f, 'Saving'))).toBe('Saving…');
    expect(button(f, 'Close').disabled).toBe(true);

    response.error(new HttpErrorResponse({ status: 0 }));
    await f.whenStable();

    expect(text(el(f).querySelector('.form-error'))).toContain('Can’t reach the server');
    expect(button(f, 'Save trip').disabled).toBe(false);
  });

  describe('the phone’s back gesture', () => {
    async function back(f: Fixture) {
      history.back();
      await f.whenStable();
    }

    it('steps back through cities, countries and the summary, then closes', async () => {
      const f = await render();
      await click(f, row(f, 'Where'));
      picker(f).step.set('cities');
      await f.whenStable();

      await back(f);
      expect(picker(f).step()).toBe('countries');

      await back(f);
      expect(el(f).querySelector('.panel')).not.toBeNull();
      expect(dialogRef.close).not.toHaveBeenCalled();

      await back(f);
      expect(dialogRef.close).toHaveBeenCalledWith(undefined);
    });

    it('goes through history for the screens’ own back buttons, so the two stay in step', async () => {
      const f = await render();
      await click(f, row(f, 'Where'));
      picker(f).step.set('cities');
      await f.whenStable();

      // The picker's own back arrow: cities → countries, then out of the picker
      picker(f).step.set('countries');
      await f.whenStable();
      picker(f).closed.emit();
      await f.whenStable();

      expect(el(f).querySelector('.panel')).not.toBeNull();
      await back(f); // one more back now closes, so no stray entries were left
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('jumps back over the picker’s entries after a pick', async () => {
      const f = await render();
      await click(f, row(f, 'Where'));
      picker(f).step.set('cities');
      await f.whenStable();

      picker(f).picked.emit(rome);
      await f.whenStable();
      await back(f);

      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('leaves history as it was when the dialog closes', async () => {
      const f = await render();
      await click(f, row(f, 'Where'));

      // Close from the summary after coming back
      picker(f).closed.emit();
      await f.whenStable();
      await click(f, button(f, 'Close'));

      expect(dialogRef.close).toHaveBeenCalledWith(undefined);
      expect(history.getState()).toBeNull(); // back on the dashboard's own entry
    });

    it('doesn’t close while saving', async () => {
      addTrip = () => new Subject<TripResponse>();
      const f = await render();
      await pickPlace(f);
      await pickDates(f);
      await click(f, button(f, 'Save trip'));

      await back(f);

      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });

  it('closes with Escape on the summary, and steps back with it on a picker', async () => {
    const f = await render();
    await click(f, row(f, 'Notes'));

    keys.next(new KeyboardEvent('keydown', { key: 'Escape' }));
    await f.whenStable();
    expect(el(f).querySelector('.panel')).not.toBeNull();

    keys.next(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dialogRef.close).toHaveBeenCalled();
  });
});

describe('describeDates', () => {
  it('writes a range compactly, with the year once', () => {
    expect(describeDates({ start: new Date(2026, 9, 12), end: new Date(2026, 9, 15) })).toBe(
      '12–15 Oct 2026',
    );
    expect(describeDates({ start: new Date(2026, 9, 29), end: new Date(2026, 10, 2) })).toBe(
      '29 Oct – 2 Nov 2026',
    );
    expect(describeDates({ start: new Date(2025, 11, 30), end: new Date(2026, 0, 2) })).toBe(
      '30 Dec 2025 – 2 Jan 2026',
    );
  });

  it('marks a day trip', () => {
    expect(describeDates({ start: new Date(2026, 10, 3), end: null })).toBe(
      '3 Nov 2026 · day trip',
    );
  });
});
