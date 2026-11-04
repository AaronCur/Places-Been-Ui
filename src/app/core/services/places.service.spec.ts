import { ICountryMeta } from '@countrystatecity/countries-browser';
import { confirmNoCities, toCityOptions, toCountryOptions } from './places.service';

// The library calls themselves go to the CDN; these cover the mapping into the dialog's options
describe('toCountryOptions', () => {
  it('maps to ISO code, name and centre point, sorted by name', () => {
    expect(
      toCountryOptions([
        { iso2: 'DE', name: 'Germany', latitude: '51.00000000', longitude: '9.00000000' },
        { iso2: 'AT', name: 'Austria', latitude: '47.33333333', longitude: '13.33333333' },
      ]),
    ).toEqual([
      { isoCode: 'AT', name: 'Austria', latitude: 47.33333333, longitude: 13.33333333 },
      { isoCode: 'DE', name: 'Germany', latitude: 51, longitude: 9 },
    ]);
  });
});

describe('confirmNoCities', () => {
  it('accepts an empty list when the country itself loaded', () => {
    expect(confirmNoCities({ name: 'Gibraltar' } as ICountryMeta)).toEqual([]);
  });

  it('treats it as a failure when the country did not load either', () => {
    expect(() => confirmNoCities(null)).toThrow();
  });
});

describe('toCityOptions', () => {
  const states = [
    { iso2: 'OR', name: 'Oregon' },
    { iso2: 'ME', name: 'Maine' },
  ];

  it('parses coordinates and names the state, so same-named cities can be told apart', () => {
    const options = toCityOptions(
      [
        { id: 1, name: 'Portland', state_code: 'OR', latitude: '45.52', longitude: '-122.67' },
        { id: 2, name: 'Portland', state_code: 'ME', latitude: '43.66', longitude: '-70.25' },
      ],
      states,
    );

    expect(options.map((o) => o.stateName)).toEqual(['Oregon', 'Maine']);
    expect(options[0]).toEqual({
      id: 1,
      name: 'Portland',
      stateName: 'Oregon',
      latitude: 45.52,
      longitude: -122.67,
    });
  });

  it('leaves the state empty when the city has none or it is unknown', () => {
    const options = toCityOptions(
      [
        { id: 1, name: 'Vaduz', state_code: null, latitude: '47.14', longitude: '9.52' },
        { id: 2, name: 'Bend', state_code: 'XX', latitude: '44.05', longitude: '-121.31' },
      ],
      states,
    );

    expect(options.map((o) => o.stateName)).toEqual([null, null]);
  });

  const city = (name: string, population?: number | null, type?: string | null) => ({
    id: 1,
    name,
    state_code: 'OR',
    latitude: '0',
    longitude: '0',
    population,
    type,
  });

  it('sorts the biggest places first, unknown population last, ties by name', () => {
    const options = toCityOptions(
      [
        city('Shaniko', 36),
        city('Unknown', null),
        city('Portland', 652_503),
        city('Salem', 175_535),
        city('Eugene', 175_535),
        city('Absent'),
      ],
      states,
    );

    expect(options.map((o) => o.name)).toEqual([
      'Portland',
      'Eugene',
      'Salem',
      'Shaniko',
      'Absent',
      'Unknown',
    ]);
  });

  it('drops neighbourhoods and ghost towns but keeps untyped and small places', () => {
    const options = toCityOptions(
      [
        city('Pearl District', 6_000, 'section'),
        city('Golden', 0, 'abandoned'),
        city('Cannon Beach', 1_700, 'city'),
        city('Joseph', 1_100, 'locality'),
        city('Mitchell', 130, null),
        city('Old Town', 0, 'destroyed'),
        city('Champoeg', 0, 'historical'),
      ],
      states,
    );

    expect(options.map((o) => o.name)).toEqual(['Cannon Beach', 'Joseph', 'Mitchell']);
  });
});
