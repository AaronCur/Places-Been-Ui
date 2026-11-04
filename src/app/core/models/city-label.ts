import { CityResponse } from './travel.model';

/**
 * Display names for one country's cities, keyed by city id. A city's state is added only when another city in
 * the list has the same name ("Portland, Oregon" next to "Portland, Maine"); otherwise it's just the name, so
 * the list stays short for the usual case.
 */
export function cityLabels(cities: readonly CityResponse[]): Map<number, string> {
  const counts = new Map<string, number>();
  for (const city of cities) {
    const key = city.name.toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Map(
    cities.map((city) => {
      const shared = (counts.get(city.name.toLocaleLowerCase()) ?? 0) > 1;
      return [city.id, shared && city.state ? `${city.name}, ${city.state}` : city.name];
    }),
  );
}
