import { CityOption, CountryOption } from '../../../../core/services/places.service';
import {
  buildTripRequest,
  filterByName,
  isFuture,
  placeAtCentre,
  placeFromCity,
  serverFieldErrors,
} from './trip-form';

const italy: CountryOption = { isoCode: 'IT', name: 'Italy', latitude: 42.8, longitude: 12.8 };
const rome: CityOption = {
  id: 1,
  name: 'Rome',
  stateName: 'Lazio',
  latitude: 41.9,
  longitude: 12.5,
};

describe('placeFromCity', () => {
  it('uses the city’s own coordinates and state', () => {
    expect(placeFromCity(italy, rome)).toEqual({
      countryCode: 'IT',
      countryName: 'Italy',
      cityName: 'Rome',
      state: 'Lazio',
      latitude: 41.9,
      longitude: 12.5,
      approximate: false,
    });
  });
});

describe('placeAtCentre', () => {
  it('pins a typed name, trimmed, at the country’s centre', () => {
    expect(placeAtCentre(italy, '  Cinque Terre ')).toEqual({
      countryCode: 'IT',
      countryName: 'Italy',
      cityName: 'Cinque Terre',
      state: null,
      latitude: 42.8,
      longitude: 12.8,
      approximate: true,
    });
  });

  it('refuses a blank or over-long name, or a country with no centre point', () => {
    expect(placeAtCentre(italy, '   ')).toBeNull();
    expect(placeAtCentre(italy, 'x'.repeat(256))).toBeNull();
    expect(placeAtCentre({ ...italy, latitude: NaN }, 'Somewhere')).toBeNull();
  });
});

describe('buildTripRequest', () => {
  const place = placeFromCity(italy, rome);

  it('sends the local days as ISO dates and trimmed notes', () => {
    expect(buildTripRequest(place, new Date(2025, 4, 1), new Date(2025, 4, 4), ' Pasta ')).toEqual({
      cityName: 'Rome',
      state: 'Lazio',
      countryCode: 'IT',
      latitude: 41.9,
      longitude: 12.5,
      startDate: '2025-05-01',
      endDate: '2025-05-04',
      notes: 'Pasta',
    });
  });

  it('sends nulls for a day trip without notes', () => {
    const request = buildTripRequest(place, new Date(2025, 4, 1), null, '  ');
    expect(request.endDate).toBeNull();
    expect(request.notes).toBeNull();
  });
});

describe('isFuture', () => {
  const now = new Date(2026, 10, 11, 9, 0);

  it('allows any time today, not tomorrow', () => {
    expect(isFuture(new Date(2026, 10, 11, 23, 0), now)).toBe(false);
    expect(isFuture(new Date(2026, 10, 12), now)).toBe(true);
    expect(isFuture(new Date(2025, 0, 1), now)).toBe(false);
  });
});

describe('serverFieldErrors', () => {
  it('maps each field in a validation message to its control', () => {
    expect(
      serverFieldErrors(
        'startDate: must be a date in the past or in the present, cityName: must not be blank',
      ),
    ).toEqual(
      new Map([
        ['start', 'The trip can’t start in the future'],
        ['city', 'Check the city name'],
      ]),
    );
  });

  it('keeps a comma inside a message from splitting it', () => {
    expect([...serverFieldErrors('notes: too long, really, endDate: bad').keys()]).toEqual([
      'notes',
      'end',
    ]);
  });

  it('recognises an unknown country', () => {
    expect([...serverFieldErrors('Unknown country code: XX').keys()]).toEqual(['country']);
  });

  it('returns nothing for messages about no field', () => {
    expect(serverFieldErrors('Malformed JSON request body or invalid data types.').size).toBe(0);
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
