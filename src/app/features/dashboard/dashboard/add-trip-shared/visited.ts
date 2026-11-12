// The dashboard's places as Add trip's "Been before" list (both dialogs). Its own small file because the
// dashboard builds it eagerly, and importing it from trip-form or a dialog would pull those into the initial
// bundle.
import { CountryResponse } from '../../../../core/models/travel.model';
import { TripResponse } from '../../../../core/models/trip.model';

/** A country already visited: listed first ("Been before"), with trip counts for its cities */
export interface VisitedCountry {
  isoCode: string;
  /** "2 cities · 3 trips" */
  summary: string;
  /** Trips per city, by cityKey(name, state) */
  cityTrips: ReadonlyMap<string, number>;
}

export const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Matches a dataset city to a visited one, which only shares its name and state (the ids differ) */
export function cityKey(name: string, state: string | null | undefined): string {
  return `${name.toLocaleLowerCase()}|${(state ?? '').toLocaleLowerCase()}`;
}

/** The dashboard's places as the picker's "Been before" list, in the dashboard's order */
export function visitedCountries(
  countries: readonly CountryResponse[],
  tripsByCity: ReadonlyMap<number, readonly TripResponse[]>,
): VisitedCountry[] {
  return countries.map((country) => {
    const cities = country.cities ?? [];
    const cityTrips = new Map<string, number>();
    let trips = 0;
    for (const city of cities) {
      const n = tripsByCity.get(city.id)?.length ?? 0;
      trips += n;
      if (n) cityTrips.set(cityKey(city.name, city.state), n);
    }
    const summary = [count(cities.length, 'city', 'cities')];
    if (trips) summary.push(count(trips, 'trip', 'trips'));
    return { isoCode: country.isoCode, summary: summary.join(' · '), cityTrips };
  });
}
