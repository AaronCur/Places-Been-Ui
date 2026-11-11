import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import {
  PlacePickerComponent,
  VisitedCountry,
  cityKey,
  visitedCountries,
} from './place-picker.component';
import {
  CityOption,
  CountryOption,
  PlacesService,
} from '../../../../../core/services/places.service';
import { PickedPlace } from '../../add-trip-shared/trip-form';
import { TripResponse } from '../../../../../core/models/trip.model';

const germany: CountryOption = { isoCode: 'DE', name: 'Germany', latitude: 51, longitude: 9 };
const gibraltar: CountryOption = {
  isoCode: 'GI',
  name: 'Gibraltar',
  latitude: 36.1,
  longitude: -5.3,
};
const italy: CountryOption = { isoCode: 'IT', name: 'Italy', latitude: 42.8, longitude: 12.8 };
const berlin: CityOption = {
  id: 1,
  name: 'Berlin',
  stateName: 'Berlin',
  latitude: 52.5,
  longitude: 13.4,
};
const bonn: CityOption = {
  id: 2,
  name: 'Bonn',
  stateName: 'North Rhine-Westphalia',
  latitude: 50.7,
  longitude: 7.1,
};

const beenToGermany: VisitedCountry = {
  isoCode: 'DE',
  summary: '1 city · 2 trips',
  cityTrips: new Map([[cityKey('Berlin', 'Berlin'), 2]]),
};

describe('PlacePickerComponent', () => {
  let getCities: (code: string) => Observable<CityOption[]>;
  let picked: PickedPlace[];
  let closed: number;

  beforeEach(() => {
    getCities = (code) => of(code === 'DE' ? [berlin, bonn] : []);
    picked = [];
    closed = 0;
  });

  async function render(visited: VisitedCountry[] = [beenToGermany]) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PlacesService,
          useValue: {
            getCountries: () => of([germany, gibraltar, italy]),
            getCities: (code: string) => getCities(code),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(PlacePickerComponent);
    fixture.componentRef.setInput('visited', visited);
    fixture.componentInstance.picked.subscribe((p) => picked.push(p));
    fixture.componentInstance.closed.subscribe(() => closed++);
    await fixture.whenStable();
    return fixture;
  }
  type Fixture = Awaited<ReturnType<typeof render>>;

  const el = (f: Fixture) => f.nativeElement as HTMLElement;
  const search = (f: Fixture) => el(f).querySelector('input') as HTMLInputElement;
  const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const headings = (f: Fixture) => [...el(f).querySelectorAll('h3')].map(text);
  // A row as the user reads it: its title, second line and trailing count, without the icon names
  const rowText = (r: Element) =>
    [...r.querySelectorAll('[matListItemTitle], [matListItemLine], [matListItemMeta]')]
      .map(text)
      .join(' ');
  const rows = (f: Fixture) => [...el(f).querySelectorAll('[mat-list-item]')].map(rowText);
  const row = (f: Fixture, name: string) =>
    [...el(f).querySelectorAll<HTMLElement>('[mat-list-item]')].find((r) =>
      rowText(r).startsWith(name),
    )!;

  async function type(f: Fixture, value: string) {
    search(f).value = value;
    search(f).dispatchEvent(new Event('input'));
    await f.whenStable();
  }

  async function click(f: Fixture, target: HTMLElement) {
    target.click();
    await f.whenStable();
  }

  async function openGermany(f: Fixture) {
    await click(f, row(f, 'Germany'));
  }

  it('lists the countries already visited first, then all of them', async () => {
    const f = await render();

    expect(headings(f)).toEqual(['Been before', 'All countries']);
    expect(rows(f)).toEqual(['Germany 1 city · 2 trips', 'Germany', 'Gibraltar', 'Italy']);
    expect(search(f).getAttribute('aria-label')).toBe('Search countries');
  });

  it('searches every country, without the visited group, as the user types', async () => {
    const f = await render();

    await type(f, 'gi');

    expect(headings(f)).toEqual(['Results']);
    expect(rows(f)).toEqual(['Gibraltar']);

    await type(f, 'xyz');
    expect(text(el(f))).toContain('No country matches “xyz”');
  });

  it('clears the search with its own button', async () => {
    const f = await render();
    await type(f, 'gi');

    await click(f, el(f).querySelector('[aria-label="Clear search"]') as HTMLElement);

    expect(search(f).value).toBe('');
    expect(headings(f)).toEqual(['Been before', 'All countries']);
  });

  it('opens the picked country’s cities, with trip counts for the ones visited', async () => {
    const f = await render();

    await openGermany(f);

    expect(f.componentInstance.step()).toBe('cities');
    expect(headings(f)).toEqual(['Germany']);
    expect(text(el(f).querySelector('.country-heading'))).toContain('2 cities');
    expect(rows(f)).toEqual(['Berlin Berlin 2 trips', 'Bonn North Rhine-Westphalia']);
    expect(search(f).getAttribute('aria-label')).toBe('Search Germany');
    expect(search(f).value).toBe(''); // each search starts empty
  });

  it('picks a listed city with its own coordinates', async () => {
    const f = await render();
    await openGermany(f);

    await click(f, row(f, 'Bonn'));

    expect(picked).toEqual([
      {
        countryCode: 'DE',
        countryName: 'Germany',
        cityName: 'Bonn',
        state: 'North Rhine-Westphalia',
        latitude: 50.7,
        longitude: 7.1,
        approximate: false,
      },
    ]);
  });

  it('offers a typed name that isn’t listed as a new place at the country’s centre', async () => {
    const f = await render();
    await openGermany(f);

    await type(f, 'Black Forest');
    const card = el(f).querySelector('.new-place') as HTMLElement;
    expect(text(card)).toContain('Add “Black Forest”');
    expect(text(card)).toContain('pinned at the centre of Germany');

    await click(f, card);
    expect(picked).toEqual([
      expect.objectContaining({
        cityName: 'Black Forest',
        latitude: 51,
        longitude: 9,
        approximate: true,
      }),
    ]);
  });

  it('doesn’t offer a new place for a name that is a listed city', async () => {
    const f = await render();
    await openGermany(f);

    await type(f, 'bonn');

    expect(rows(f)).toEqual(['Bonn North Rhine-Westphalia']);
    expect(el(f).querySelector('.new-place')).toBeNull();
  });

  it('asks for the name of the place in a country with no city list', async () => {
    const f = await render();
    await click(f, row(f, 'Gibraltar'));

    expect(text(el(f))).toContain('No city list for Gibraltar. Type the name of the place.');

    await type(f, 'Upper Rock');
    expect(text(el(f).querySelector('.new-place'))).toContain('Add “Upper Rock”');
  });

  it('retries a failed city load', async () => {
    getCities = () => throwError(() => new Error('offline'));
    const f = await render();
    await openGermany(f);
    expect(text(el(f).querySelector('[role="alert"]'))).toContain('Couldn’t load the cities');

    getCities = () => of([berlin]);
    await click(f, el(f).querySelector('[role="alert"] button') as HTMLElement);

    expect(el(f).querySelector('[role="alert"]')).toBeNull();
    expect(rows(f)).toEqual(['Berlin Berlin 2 trips']);
  });

  it('goes back from the cities to the countries, then out of the picker', async () => {
    const f = await render();
    await openGermany(f);
    const back = () => el(f).querySelector('.search-bar button') as HTMLElement;

    expect(back().getAttribute('aria-label')).toBe('Back to countries');
    await click(f, back());
    expect(f.componentInstance.step()).toBe('countries');
    expect(closed).toBe(0);

    await click(f, back());
    expect(closed).toBe(1);
  });

  it('shows the countries again when the dialog steps it back (the phone’s back gesture)', async () => {
    const f = await render();
    await openGermany(f);

    f.componentInstance.step.set('countries');
    await f.whenStable();

    expect(headings(f)).toEqual(['Been before', 'All countries']);
  });
});

describe('visitedCountries', () => {
  const trip = (cityId: number) => ({ city: { id: cityId } }) as TripResponse;

  it('summarises each country and counts trips by city name and state', () => {
    const result = visitedCountries(
      [
        {
          id: 1,
          name: 'United States',
          isoCode: 'US',
          flag: '',
          cities: [
            { id: 10, name: 'Portland', state: 'Oregon', latitude: 45.5, longitude: -122.7 },
            { id: 11, name: 'Portland', state: 'Maine', latitude: 43.7, longitude: -70.3 },
          ],
        },
        {
          id: 2,
          name: 'Gibraltar',
          isoCode: 'GI',
          flag: '',
          cities: [{ id: 20, name: 'Gibraltar', latitude: 36.1, longitude: -5.3 }],
        },
      ],
      new Map([
        [10, [trip(10), trip(10)]],
        [20, [trip(20)]],
      ]),
    );

    expect(result.map((r) => [r.isoCode, r.summary])).toEqual([
      ['US', '2 cities · 2 trips'],
      ['GI', '1 city · 1 trip'],
    ]);
    // Same-named cities stay apart; one without a state matches on its name alone
    expect(result[0].cityTrips.get(cityKey('portland', 'oregon'))).toBe(2);
    expect(result[0].cityTrips.has(cityKey('Portland', 'Maine'))).toBe(false);
    expect(result[1].cityTrips.get(cityKey('Gibraltar', null))).toBe(1);
  });

  it('leaves out the trips for a country whose cities have none yet', () => {
    const [result] = visitedCountries(
      [
        {
          id: 1,
          name: 'Italy',
          isoCode: 'IT',
          flag: '',
          cities: [{ id: 5, name: 'Rome', latitude: 41.9, longitude: 12.5 }],
        },
      ],
      new Map(),
    );

    expect(result.summary).toBe('1 city');
  });
});
