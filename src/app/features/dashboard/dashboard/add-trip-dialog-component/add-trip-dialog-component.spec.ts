import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialogRef } from '@angular/material/dialog';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AddTripDialogComponent } from './add-trip-dialog-component';
import { CityOption, CountryOption, PlacesService } from '../../../../core/services/places.service';
import { MapFocusService } from '../../../../core/services/map-focus.service';
import { TripService } from '../../../../core/services/trip.service';
import { TripRequest, TripResponse } from '../../../../core/models/trip.model';

const germany: CountryOption = { isoCode: 'DE', name: 'Germany', latitude: 51, longitude: 9 };
// No cities in the test dataset, like Gibraltar or Macau in the real one
const gibraltar: CountryOption = {
  isoCode: 'GI',
  name: 'Gibraltar',
  latitude: 36.13,
  longitude: -5.35,
};
const berlin: CityOption = {
  id: 1,
  name: 'Berlin',
  stateName: 'Berlin',
  latitude: 52.52,
  longitude: 13.405,
};
const bonn: CityOption = {
  id: 2,
  name: 'Bonn',
  stateName: 'North Rhine-Westphalia',
  latitude: 50.73,
  longitude: 7.1,
};
const created: TripResponse = {
  id: 7,
  startDate: '2025-05-01',
  endDate: '2025-05-04',
  city: { id: 1, name: 'Berlin', state: 'Berlin', latitude: 52.52, longitude: 13.405 },
  country: { isoCode: 'DE', name: 'Germany', flag: '🇩🇪' },
};

const badRequest = (message: string) =>
  throwError(() => new HttpErrorResponse({ status: 400, error: { message } }));

describe('AddTripDialogComponent', () => {
  let addTrip: (request: TripRequest) => Observable<TripResponse>;
  let sent: TripRequest[];
  let getCities: (code: string) => Observable<CityOption[]>;
  let dialogRef: { close: ReturnType<typeof vi.fn>; disableClose?: boolean };

  beforeEach(() => {
    getCities = (code) => of(code === 'DE' ? [berlin, bonn] : []);
    sent = [];
    addTrip = (request) => {
      sent.push(request);
      return of(created);
    };
  });

  async function render() {
    dialogRef = { close: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: PlacesService,
          useValue: {
            getCountries: () => of([germany, gibraltar]),
            getCities: (code: string) => getCities(code),
          },
        },
        { provide: TripService, useValue: { addTrip: (r: TripRequest) => addTrip(r) } },
      ],
    });
    const fixture = TestBed.createComponent(AddTripDialogComponent);
    await fixture.whenStable();
    return fixture;
  }
  type Fixture = Awaited<ReturnType<typeof render>>;

  function controls(fixture: Fixture) {
    return (fixture.componentInstance as unknown as { form: AddTripDialogComponent['form'] }).form
      .controls;
  }

  const inputs = (fixture: Fixture) => {
    const [country, city, start, end] = fixture.nativeElement.querySelectorAll('input');
    // The textarea has the same value/focus/dispatchEvent the helpers use
    const notes = fixture.nativeElement.querySelector('textarea');
    return { country, city, start, end, notes } as Record<string, HTMLInputElement>;
  };
  const text = (fixture: Fixture) => fixture.nativeElement.textContent as string;

  // Options in the panel this input opened (each input's aria-controls names its own panel)
  const options = (input: HTMLInputElement) =>
    [...document.querySelectorAll(`#${input.getAttribute('aria-controls')} mat-option`)].map((o) =>
      o.textContent!.replace(/\s+/g, ' ').trim(),
    );

  // Types like a user: input events through the autocomplete trigger / datepicker input, not
  // control.setValue(). That's the path that parses typed dates with the day-first adapter.
  async function type(fixture: Fixture, input: HTMLInputElement, value: string) {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  // Picks like a user too: types the name, then clicks the option in the panel that opened
  async function pick(fixture: Fixture, input: HTMLInputElement, name: string) {
    input.focus();
    input.value = name;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const panel = document.getElementById(input.getAttribute('aria-controls')!)!;
    (panel.querySelector('mat-option') as HTMLElement).click();
    await fixture.whenStable();
  }

  async function pickGermanyBerlin(fixture: Fixture) {
    await pick(fixture, inputs(fixture)['country'], 'Germany');
    await pick(fixture, inputs(fixture)['city'], 'Berlin');
  }

  async function fillBerlinTrip(fixture: Fixture, start = '01/05/2025', end = '04/05/2025') {
    await pickGermanyBerlin(fixture);
    await type(fixture, inputs(fixture)['start'], start);
    if (end) await type(fixture, inputs(fixture)['end'], end);
  }

  const submit = async (fixture: Fixture) => {
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).requestSubmit();
    await fixture.whenStable();
  };

  it('keeps the city field closed until a country is picked', async () => {
    const fixture = await render();

    expect(controls(fixture).city.disabled).toBe(true);
    expect(text(fixture)).toContain('Pick a country first');

    await pick(fixture, inputs(fixture)['country'], 'Germany');

    expect(controls(fixture).city.enabled).toBe(true);
  });

  it('filters countries and cities as the user types', async () => {
    const fixture = await render();
    const { country, city } = inputs(fixture);

    await type(fixture, country, 'gib');
    expect(controls(fixture).country.value).toBe('gib');
    expect(options(country)).toEqual(['Gibraltar']);

    await pick(fixture, country, 'Germany');
    await type(fixture, city, 'bo');
    expect(options(city)).toEqual([expect.stringContaining('Bonn')]);
    // The state disambiguates same-named cities
    expect(document.querySelector('.state')?.textContent).toBe('North Rhine-Westphalia');
  });

  it('turns the globe to the picked country, then closer in on the picked city', async () => {
    const fixture = await render();
    const focus = TestBed.inject(MapFocusService);
    const { country, city } = inputs(fixture);

    await type(fixture, country, 'Ger');
    expect(focus.target()).toBeNull(); // typing alone doesn't move the globe

    await pick(fixture, country, 'Germany');
    expect(focus.target()).toEqual({ lat: 51, lng: 9, altitude: 1.4 });

    await pick(fixture, city, 'Berlin');
    expect(focus.target()).toEqual({ lat: 52.52, lng: 13.405, altitude: 0.6 });
  });

  it('saves the trip with ISO dates, typed day first, and closes with the created trip', async () => {
    const fixture = await render();

    await fillBerlinTrip(fixture, '01/05/2025', '04/05/2025');
    await type(fixture, inputs(fixture)['notes'], '  Museum Island  ');
    await submit(fixture);

    expect(sent).toEqual([
      {
        cityName: 'Berlin',
        state: 'Berlin',
        countryCode: 'DE',
        latitude: 52.52,
        longitude: 13.405,
        startDate: '2025-05-01',
        endDate: '2025-05-04',
        notes: 'Museum Island',
      },
    ]);
    expect(dialogRef.close).toHaveBeenCalledWith(created);
  });

  it('saves a day trip with no end date and no notes as nulls', async () => {
    const fixture = await render();

    await fillBerlinTrip(fixture, '01/05/2025', '');
    await submit(fixture);

    expect(sent).toEqual([expect.objectContaining({ endDate: null, notes: null })]);
  });

  it('needs a start date, not in the future', async () => {
    const fixture = await render();

    await pickGermanyBerlin(fixture);
    await submit(fixture);
    expect(text(fixture)).toContain('When did the trip start?');

    await type(fixture, inputs(fixture)['start'], '01/05/2099');
    await submit(fixture);
    expect(text(fixture)).toContain('The trip can’t start in the future');
    expect(sent).toEqual([]);
  });

  it('rejects an end before the start, and dates it can’t read', async () => {
    const fixture = await render();

    await fillBerlinTrip(fixture, '04/05/2025', '01/05/2025');
    await submit(fixture);
    expect(text(fixture)).toContain('The end can’t be before the start');

    await type(fixture, inputs(fixture)['end'], '31/02/2025');
    await submit(fixture);
    expect(text(fixture)).toContain('Write dates as DD/MM/YYYY');
    expect(sent).toEqual([]);
  });

  it('caps the notes at the API’s limit', async () => {
    const fixture = await render();

    await fillBerlinTrip(fixture);
    await type(fixture, inputs(fixture)['notes'], 'x'.repeat(2001));
    await submit(fixture);

    expect(text(fixture)).toContain('Notes can be up to 2000 characters (2001 now)');
    expect(sent).toEqual([]);
  });

  it('does not save typed text that was never picked from the list', async () => {
    const fixture = await render();

    await type(fixture, inputs(fixture)['country'], 'Germ');
    await submit(fixture);

    expect(sent).toEqual([]);
    expect(text(fixture)).toContain('Pick a country from the list');
  });

  it('highlights the picked city on the globe until it’s dropped or the dialog closes', async () => {
    const fixture = await render();
    const focus = TestBed.inject(MapFocusService);

    await pick(fixture, inputs(fixture)['country'], 'Germany');
    expect(focus.pin()).toBeNull(); // a country alone isn't a place yet

    await pick(fixture, inputs(fixture)['city'], 'Berlin');
    expect(focus.pin()).toEqual({ lat: 52.52, lng: 13.405, label: 'Berlin, Germany' });

    await type(fixture, inputs(fixture)['city'], 'Ber'); // edited back to unpicked text
    expect(focus.pin()).toBeNull();

    await pick(fixture, inputs(fixture)['city'], 'Berlin');
    fixture.destroy();
    expect(focus.pin()).toBeNull();
  });

  describe('a country with no cities in the dataset', () => {
    it('highlights a typed city at the country’s centre', async () => {
      const fixture = await render();
      const focus = TestBed.inject(MapFocusService);

      await pick(fixture, inputs(fixture)['country'], 'Gibraltar');
      await type(fixture, inputs(fixture)['city'], 'Gibraltar Town');

      expect(focus.pin()).toEqual({ lat: 36.13, lng: -5.35, label: 'Gibraltar Town, Gibraltar' });
    });

    it('lets the city be typed and pins it at the country’s centre', async () => {
      const fixture = await render();

      await pick(fixture, inputs(fixture)['country'], 'Gibraltar');
      expect(text(fixture)).toContain('No city list here');

      await type(fixture, inputs(fixture)['city'], '  Gibraltar Town ');
      await type(fixture, inputs(fixture)['start'], '01/05/2025');
      await submit(fixture);

      expect(sent).toEqual([
        expect.objectContaining({
          cityName: 'Gibraltar Town',
          state: null,
          countryCode: 'GI',
          latitude: 36.13,
          longitude: -5.35,
        }),
      ]);
    });

    it('still needs a name', async () => {
      const fixture = await render();

      await pick(fixture, inputs(fixture)['country'], 'Gibraltar');
      await type(fixture, inputs(fixture)['city'], '   ');
      await type(fixture, inputs(fixture)['start'], '01/05/2025');
      await submit(fixture);

      expect(text(fixture)).toContain('Type the name of the place');
      expect(sent).toEqual([]);
    });

    it('goes back to picking from the list when another country is chosen', async () => {
      const fixture = await render();

      await pick(fixture, inputs(fixture)['country'], 'Gibraltar');
      await pick(fixture, inputs(fixture)['country'], 'Germany');
      await type(fixture, inputs(fixture)['city'], 'Somewhere');
      await submit(fixture);

      expect(text(fixture)).toContain('Pick a city from the list');
    });
  });

  it('shows the API’s field errors under the fields they’re about', async () => {
    const fixture = await render();
    addTrip = () =>
      badRequest(
        'endDate: End date must be on or after the start date, notes: size must be between 0 and 2000',
      );

    await fillBerlinTrip(fixture);
    await submit(fixture);

    expect(text(fixture)).toContain('The end can’t be before the start');
    expect(text(fixture)).toContain('Notes can be up to 2000 characters');
    expect(fixture.nativeElement.querySelector('.form-error')).toBeNull();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('shows an unknown country next to the country field', async () => {
    const fixture = await render();
    addTrip = () => badRequest('Unknown country code: DE');

    await fillBerlinTrip(fixture);
    await submit(fixture);

    expect(text(fixture)).toContain('This country isn’t supported yet');
  });

  it('shows other failures for the whole form and lets the user retry', async () => {
    const fixture = await render();
    const response = new Subject<TripResponse>();
    addTrip = () => response;

    await fillBerlinTrip(fixture);
    await submit(fixture);
    const save = () =>
      fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(save().disabled).toBe(true);

    response.error(new HttpErrorResponse({ status: 0 }));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Can’t reach the server',
    );
    expect(save().disabled).toBe(false);
  });

  it('cannot be closed while saving, so the new trip is never lost', async () => {
    const fixture = await render();
    const response = new Subject<TripResponse>();
    addTrip = () => response;
    const cancel = () => fixture.nativeElement.querySelector('[mat-dialog-close]');

    await fillBerlinTrip(fixture);
    expect(dialogRef.disableClose).toBe(false);
    expect(cancel().disabled).toBe(false);

    await submit(fixture);
    expect(dialogRef.disableClose).toBe(true);
    expect(cancel().disabled).toBe(true);

    response.error(new HttpErrorResponse({ status: 500 }));
    await fixture.whenStable();
    expect(dialogRef.disableClose).toBe(false);
    expect(cancel().disabled).toBe(false);
  });

  it('retries a failed city load', async () => {
    getCities = () => throwError(() => new Error('offline'));
    const fixture = await render();
    const retry = () =>
      fixture.nativeElement.querySelector('[aria-label="Retry loading cities"]') as HTMLElement;

    await pick(fixture, inputs(fixture)['country'], 'Germany');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Couldn’t load cities',
    );

    getCities = () => of([berlin]);
    retry().click();
    await fixture.whenStable();

    expect(text(fixture)).not.toContain('Couldn’t load cities');
    expect(retry()).toBeNull();
  });
});
