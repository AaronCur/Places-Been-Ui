import { toCityOptions, toCountryOptions } from './places.service';

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

describe('toCityOptions', () => {
  const states = [
    { iso2: 'OR', name: 'Oregon' },
    { iso2: 'ME', name: 'Maine' },
  ];

  it('parses coordinates and names the state, so same-named cities can be told apart', () => {
    const options = toCityOptions(
      [
        { name: 'Portland', state_code: 'OR', latitude: '45.52', longitude: '-122.67' },
        { name: 'Portland', state_code: 'ME', latitude: '43.66', longitude: '-70.25' },
      ],
      states,
    );

    expect(options.map((o) => o.stateName)).toEqual(['Oregon', 'Maine']);
    expect(options[0]).toEqual({
      name: 'Portland',
      stateName: 'Oregon',
      latitude: 45.52,
      longitude: -122.67,
    });
  });

  it('leaves the state empty when the city has none or it is unknown', () => {
    const options = toCityOptions(
      [
        { name: 'Vaduz', state_code: null, latitude: '47.14', longitude: '9.52' },
        { name: 'Bend', state_code: 'XX', latitude: '44.05', longitude: '-121.31' },
      ],
      states,
    );

    expect(options.map((o) => o.stateName)).toEqual([null, null]);
  });

  it('sorts by name', () => {
    const options = toCityOptions(
      [
        { name: 'Salem', state_code: 'OR', latitude: '0', longitude: '0' },
        { name: 'Eugene', state_code: 'OR', latitude: '0', longitude: '0' },
      ],
      states,
    );

    expect(options.map((o) => o.name)).toEqual(['Eugene', 'Salem']);
  });
});
