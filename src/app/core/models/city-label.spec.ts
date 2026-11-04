import { cityLabels } from './city-label';
import { CityResponse } from './travel.model';

const city = (id: number, name: string, state?: string): CityResponse => ({
  id,
  name,
  state,
  latitude: 0,
  longitude: 0,
});

describe('cityLabels', () => {
  it('uses the plain name when no other city shares it', () => {
    const labels = cityLabels([
      city(1, 'Seattle', 'Washington'),
      city(2, 'Boston', 'Massachusetts'),
    ]);

    expect([...labels.values()]).toEqual(['Seattle', 'Boston']);
  });

  it('adds the state to cities that share a name, ignoring case', () => {
    const labels = cityLabels([city(1, 'Portland', 'Oregon'), city(2, 'portland', 'Maine')]);

    expect(labels.get(1)).toBe('Portland, Oregon');
    expect(labels.get(2)).toBe('portland, Maine');
  });

  it('keeps the plain name for a same-name city with no state', () => {
    const labels = cityLabels([city(1, 'Portland', 'Oregon'), city(2, 'Portland')]);

    expect(labels.get(1)).toBe('Portland, Oregon');
    expect(labels.get(2)).toBe('Portland');
  });

  it('returns an empty map for no cities', () => {
    expect(cityLabels([]).size).toBe(0);
  });
});
