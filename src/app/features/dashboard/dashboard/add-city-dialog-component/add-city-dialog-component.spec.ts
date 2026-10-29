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
  name: 'Berlin',
  stateName: 'Berlin',
  latitude: 52.52,
  longitude: 13.405,
};
const bonn: CityOption = {
  name: 'Bonn',
  stateName: 'North Rhine-Westphalia',
  latitude: 50.73,
  longitude: 7.1,
};

describe('AddCityDialogComponent', () => {
  let addCity: (request: CityRequest) => Observable<CityResponse>;
  let close: ReturnType<typeof vi.fn>;

  async function render() {
    close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: { close } },
        {
          provide: PlacesService,
          useValue: {
            getCountries: () => of([germany, spain]),
            getCities: (code: string) => of(code === 'DE' ? [berlin, bonn] : []),
          },
        },
        { provide: TravelService, useValue: { addCity: (r: CityRequest) => addCity(r) } },
      ],
    });
    const fixture = TestBed.createComponent(AddCityDialogComponent);
    await fixture.whenStable();
    return fixture;
  }

  // The tests drive the form controls directly, as picking an autocomplete option does
  function controls(fixture: Awaited<ReturnType<typeof render>>) {
    return (fixture.componentInstance as unknown as { form: AddCityDialogComponent['form'] }).form
      .controls;
  }

  // Options in the panel this input opened (each input's aria-controls names its own panel)
  const options = (input: HTMLInputElement) =>
    [...document.querySelectorAll(`#${input.getAttribute('aria-controls')} mat-option`)].map((o) =>
      o.textContent!.replace(/\s+/g, ' ').trim(),
    );

  it('keeps the city field closed until a country is picked', async () => {
    const fixture = await render();

    expect(controls(fixture).city.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Pick a country first');

    controls(fixture).country.setValue(germany);
    await fixture.whenStable();

    expect(controls(fixture).city.enabled).toBe(true);
  });

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

  it('filters countries and cities as the user types', async () => {
    const fixture = await render();
    const [countryInput, cityInput] = fixture.nativeElement.querySelectorAll('input');

    await type(fixture, countryInput, 'sp');
    expect(controls(fixture).country.value).toBe('sp');
    expect(options(countryInput)).toEqual(['Spain']);

    controls(fixture).country.setValue(germany); // picking an option
    await fixture.whenStable();
    await type(fixture, cityInput, 'bo');
    expect(options(cityInput)).toEqual([expect.stringContaining('Bonn')]);
    // The state disambiguates same-named cities
    expect(document.querySelector('.state')?.textContent).toBe('North Rhine-Westphalia');
  });

  it('turns the globe to the picked country, then closer in on the picked city', async () => {
    const fixture = await render();
    const focus = TestBed.inject(MapFocusService);

    await type(fixture, fixture.nativeElement.querySelector('input'), 'Ger');
    expect(focus.target()).toBeNull(); // typing alone doesn't move the globe

    controls(fixture).country.setValue(germany);
    await fixture.whenStable();
    expect(focus.target()).toEqual({ lat: 51, lng: 9, altitude: 1.4 });

    controls(fixture).city.setValue(berlin);
    await fixture.whenStable();
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

    controls(fixture).country.setValue(germany);
    controls(fixture).city.setValue(berlin);
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).requestSubmit();

    expect(sent).toEqual([
      { name: 'Berlin', countryCode: 'DE', latitude: 52.52, longitude: 13.405 },
    ]);
    expect(close).toHaveBeenCalledWith(created);
  });

  it('does not save typed text that was never picked from the list', async () => {
    const fixture = await render();
    addCity = vi.fn();

    controls(fixture).country.setValue('Germ');
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).requestSubmit();
    await fixture.whenStable();

    expect(addCity).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Pick a country from the list');
  });

  it('shows a duplicate city next to the city field', async () => {
    const fixture = await render();
    addCity = () =>
      throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'exists' } }));

    controls(fixture).country.setValue(germany);
    controls(fixture).city.setValue(berlin);
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).requestSubmit();
    controls(fixture).city.markAsTouched();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('You’ve already added this city');
    expect(close).not.toHaveBeenCalled();
  });

  it('shows an unknown country next to the country field', async () => {
    const fixture = await render();
    addCity = () =>
      throwError(
        () =>
          new HttpErrorResponse({ status: 400, error: { message: 'Unknown country code: DE' } }),
      );

    controls(fixture).country.setValue(germany);
    controls(fixture).city.setValue(berlin);
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).requestSubmit();
    controls(fixture).country.markAsTouched();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('This country isn’t supported yet');
  });

  it('shows other failures for the whole form and lets the user retry', async () => {
    const fixture = await render();
    const response = new Subject<CityResponse>();
    addCity = () => response;

    controls(fixture).country.setValue(germany);
    controls(fixture).city.setValue(berlin);
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).requestSubmit();
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

  it('caps long lists', () => {
    expect(names('', 2)).toHaveLength(2);
  });
});
