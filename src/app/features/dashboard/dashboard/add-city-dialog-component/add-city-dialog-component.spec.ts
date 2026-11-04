import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialogRef } from '@angular/material/dialog';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AddCityDialogComponent, filterByName } from './add-city-dialog-component';
import { CityOption, CountryOption, PlacesService } from '../../../../core/services/places.service';
import { MapFocusService } from '../../../../core/services/map-focus.service';
import { TravelService } from '../../../../core/services/travel.service';
import { CityRequest, CityResponse } from '../../../../core/models/travel.model';

const germany: CountryOption = { isoCode: 'DE', name: 'Germany', latitude: 51, longitude: 9 };
const spain: CountryOption = { isoCode: 'ES', name: 'Spain', latitude: 40, longitude: -4 };
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

describe('AddCityDialogComponent', () => {
  let addCity: (request: CityRequest) => Observable<CityResponse>;
  let getCities: (code: string) => Observable<CityOption[]>;
  let dialogRef: { close: ReturnType<typeof vi.fn>; disableClose?: boolean };

  beforeEach(() => {
    getCities = (code) => of(code === 'DE' ? [berlin, bonn] : []);
  });

  async function render() {
    dialogRef = { close: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: PlacesService,
          useValue: {
            getCountries: () => of([germany, spain]),
            getCities: (code: string) => getCities(code),
          },
        },
        { provide: TravelService, useValue: { addCity: (r: CityRequest) => addCity(r) } },
      ],
    });
    const fixture = TestBed.createComponent(AddCityDialogComponent);
    await fixture.whenStable();
    return fixture;
  }

  function controls(fixture: Awaited<ReturnType<typeof render>>) {
    return (fixture.componentInstance as unknown as { form: AddCityDialogComponent['form'] }).form
      .controls;
  }

  // Options in the panel this input opened (each input's aria-controls names its own panel)
  const options = (input: HTMLInputElement) =>
    [...document.querySelectorAll(`#${input.getAttribute('aria-controls')} mat-option`)].map((o) =>
      o.textContent!.replace(/\s+/g, ' ').trim(),
    );

  // Types like a user: input events through the autocomplete trigger, not control.setValue(). This is the
  // path `requireSelection` broke (it stops typed text reaching the form, so nothing filtered).
  async function type(
    fixture: Awaited<ReturnType<typeof render>>,
    input: HTMLInputElement,
    text: string,
  ) {
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  // Picks like a user too: types the name, then clicks the option in the panel that opened
  async function pick(
    fixture: Awaited<ReturnType<typeof render>>,
    input: HTMLInputElement,
    name: string,
  ) {
    await type(fixture, input, name);
    const panel = document.getElementById(input.getAttribute('aria-controls')!)!;
    (panel.querySelector('mat-option') as HTMLElement).click();
    await fixture.whenStable();
  }

  async function pickGermanyBerlin(fixture: Awaited<ReturnType<typeof render>>) {
    const [countryInput, cityInput] = fixture.nativeElement.querySelectorAll('input');
    await pick(fixture, countryInput, 'Germany');
    await pick(fixture, cityInput, 'Berlin');
  }

  const submit = (fixture: Awaited<ReturnType<typeof render>>) =>
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).requestSubmit();

  it('keeps the city field closed until a country is picked', async () => {
    const fixture = await render();

    expect(controls(fixture).city.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Pick a country first');

    await pick(fixture, fixture.nativeElement.querySelector('input'), 'Germany');

    expect(controls(fixture).city.enabled).toBe(true);
  });

  it('filters countries and cities as the user types', async () => {
    const fixture = await render();
    const [countryInput, cityInput] = fixture.nativeElement.querySelectorAll('input');

    await type(fixture, countryInput, 'sp');
    expect(controls(fixture).country.value).toBe('sp');
    expect(options(countryInput)).toEqual(['Spain']);

    await pick(fixture, countryInput, 'Germany');
    await type(fixture, cityInput, 'bo');
    expect(options(cityInput)).toEqual([expect.stringContaining('Bonn')]);
    // The state disambiguates same-named cities
    expect(document.querySelector('.state')?.textContent).toBe('North Rhine-Westphalia');
  });

  it('turns the globe to the picked country, then closer in on the picked city', async () => {
    const fixture = await render();
    const focus = TestBed.inject(MapFocusService);
    const [countryInput, cityInput] = fixture.nativeElement.querySelectorAll('input');

    await type(fixture, countryInput, 'Ger');
    expect(focus.target()).toBeNull(); // typing alone doesn't move the globe

    await pick(fixture, countryInput, 'Germany');
    expect(focus.target()).toEqual({ lat: 51, lng: 9, altitude: 1.4 });

    await pick(fixture, cityInput, 'Berlin');
    expect(focus.target()).toEqual({ lat: 52.52, lng: 13.405, altitude: 0.6 });
  });

  it('saves the picked city with its coordinates and closes with the created city', async () => {
    const fixture = await render();
    const created: CityResponse = {
      id: 1,
      name: 'Berlin',
      latitude: 52.52,
      longitude: 13.405,
      countryCode: 'DE',
    };
    const sent: CityRequest[] = [];
    addCity = (request) => {
      sent.push(request);
      return of(created);
    };

    await pickGermanyBerlin(fixture);
    submit(fixture);

    expect(sent).toEqual([
      { name: 'Berlin', countryCode: 'DE', latitude: 52.52, longitude: 13.405 },
    ]);
    expect(dialogRef.close).toHaveBeenCalledWith(created);
  });

  it('does not save typed text that was never picked from the list', async () => {
    const fixture = await render();
    addCity = vi.fn();

    await type(fixture, fixture.nativeElement.querySelector('input'), 'Germ');
    submit(fixture);
    await fixture.whenStable();

    expect(addCity).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Pick a country from the list');
  });

  it('shows a duplicate city next to the city field', async () => {
    const fixture = await render();
    addCity = () =>
      throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'exists' } }));

    await pickGermanyBerlin(fixture);
    submit(fixture);
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('You’ve already added this city');
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('shows an unknown country next to the country field', async () => {
    const fixture = await render();
    addCity = () =>
      throwError(
        () =>
          new HttpErrorResponse({ status: 400, error: { message: 'Unknown country code: DE' } }),
      );

    await pickGermanyBerlin(fixture);
    submit(fixture);
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('This country isn’t supported yet');
  });

  it('shows other failures for the whole form and lets the user retry', async () => {
    const fixture = await render();
    const response = new Subject<CityResponse>();
    addCity = () => response;

    await pickGermanyBerlin(fixture);
    submit(fixture);
    await fixture.whenStable();
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

  it('cannot be closed while saving, so the new city is never lost', async () => {
    const fixture = await render();
    const response = new Subject<CityResponse>();
    addCity = () => response;
    const cancel = () => fixture.nativeElement.querySelector('[mat-dialog-close]');

    await pickGermanyBerlin(fixture);
    expect(dialogRef.disableClose).toBe(false);
    expect(cancel().disabled).toBe(false);

    submit(fixture);
    await fixture.whenStable();
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

    await pick(fixture, fixture.nativeElement.querySelector('input'), 'Germany');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Couldn’t load cities',
    );

    getCities = () => of([berlin]);
    retry().click();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).not.toContain('Couldn’t load cities');
    expect(retry()).toBeNull();
  });

  it('says so when a country has no cities in the dataset', async () => {
    const fixture = await render();

    await pick(fixture, fixture.nativeElement.querySelector('input'), 'Spain');

    expect(fixture.nativeElement.textContent).toContain('No cities listed for this country');
  });
});

describe('filterByName', () => {
  const countries = [
    { name: 'South Korea' },
    { name: 'Korea North' },
    { name: 'United Kingdom' },
    { name: 'Guinea-Bissau' },
    { name: 'Germany' },
  ];
  const names = (query: string, limit?: number) =>
    filterByName(countries, query, limit).map((c) => c.name);

  it('returns everything for an empty query', () => {
    expect(names('  ')).toHaveLength(5);
  });

  it('matches the start of any word, names that start with the query first', () => {
    expect(names('korea')).toEqual(['Korea North', 'South Korea']);
    expect(names('kingdom')).toEqual(['United Kingdom']);
    expect(names('bissau')).toEqual(['Guinea-Bissau']);
  });

  it('ignores case and does not match the middle of a word', () => {
    expect(names('GER')).toEqual(['Germany']);
    expect(names('erman')).toEqual([]);
  });

  it('keeps the input order within each group, so cities stay biggest first', () => {
    // Not alphabetical, as the population-sorted city list wouldn't be
    const cities = ['Sierra Grande', 'Granada', 'Alto Gredos', 'Grazalema', 'Gor'].map((name) => ({
      name,
    }));
    expect(filterByName(cities, 'gr').map((c) => c.name)).toEqual([
      'Granada',
      'Grazalema',
      'Sierra Grande',
      'Alto Gredos',
    ]);
  });

  it('caps long lists', () => {
    expect(names('', 2)).toHaveLength(2);
  });
});
