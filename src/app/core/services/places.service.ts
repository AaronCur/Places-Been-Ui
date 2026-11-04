import { Injectable } from '@angular/core';
import { defer, forkJoin, map, Observable, of, shareReplay, switchMap } from 'rxjs';
import {
  ICity,
  ICountry,
  ICountryMeta,
  IState,
  getAllCitiesOfCountry,
  getCountries,
  getCountryByCode,
  getStatesOfCountry,
} from '@countrystatecity/countries-browser';

// A country or city you can pick when adding a place. Data comes from @countrystatecity/countries-browser
// (the same dataset the API's country table was seeded from), fetched lazily from its CDN.
export interface CountryOption {
  isoCode: string;
  name: string;
  // The dataset's centre point for the country, used to turn the globe towards it
  latitude: number;
  longitude: number;
}

export interface CityOption {
  id: number;
  name: string;
  // Disambiguates same-named cities in one country (Portland, Oregon vs Portland, Maine)
  stateName: string | null;
  latitude: number;
  longitude: number;
}

@Injectable({
  providedIn: 'root',
})
export class PlacesService {
  // Fetched once per session; the library also caches, but this shares one Observable per request
  private countries$?: Observable<CountryOption[]>;
  private cities = new Map<string, Observable<CityOption[]>>();

  getCountries(): Observable<CountryOption[]> {
    this.countries$ ??= defer(() => getCountries()).pipe(map(toCountryOptions), shareReplay(1));
    return this.countries$;
  }

  getCities(isoCode: string): Observable<CityOption[]> {
    let cities$ = this.cities.get(isoCode);
    if (!cities$) {
      cities$ = forkJoin({
        cities: defer(() => getAllCitiesOfCountry(isoCode)),
        states: defer(() => getStatesOfCountry(isoCode)),
      }).pipe(
        switchMap(({ cities, states }) =>
          cities.length
            ? of(toCityOptions(cities, states))
            : defer(() => getCountryByCode(isoCode)).pipe(map(confirmNoCities)),
        ),
        shareReplay(1), // keeps results only; after an error the next subscriber fetches again
      );
      this.cities.set(isoCode, cities$);
    }
    return cities$;
  }
}

export function toCountryOptions(
  countries: Pick<ICountry, 'iso2' | 'name' | 'latitude' | 'longitude'>[],
): CountryOption[] {
  return countries
    .map((c) => ({
      isoCode: c.iso2,
      name: c.name,
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The library turns every failed request into an empty list, so an empty result alone can't tell "offline"
 * from a country with no cities in the dataset (Macau, Gibraltar…). Every country has its own file though:
 * if that didn't load either (null), the requests failed. This throws so the failure isn't cached.
 */
export function confirmNoCities(country: ICountryMeta | null): CityOption[] {
  if (!country) throw new Error('Could not load the cities');
  return [];
}

// Dataset entries that aren't places you visit: neighbourhoods listed beside their own city, and ghost towns
const EXCLUDED_CITY_TYPES = new Set(['section', 'abandoned', 'destroyed', 'historical']);

/**
 * Biggest places first, so a short query offers Granada before a village of 200; filterByName keeps this order
 * within its matches. Small towns stay in the list (they're real trips), they just need more typing. The
 * dataset's `type` is too inconsistent to filter on beyond the exclusions (Madrid is a "municipality", Sevilla
 * a "locality"), but population is filled in for ~90% of entries; those without one sort last.
 */
export function toCityOptions(
  cities: Pick<
    ICity,
    'id' | 'name' | 'state_code' | 'latitude' | 'longitude' | 'type' | 'population'
  >[],
  states: Pick<IState, 'iso2' | 'name'>[],
): CityOption[] {
  const stateNames = new Map(states.map((s) => [s.iso2, s.name]));
  return cities
    .filter((c) => !c.type || !EXCLUDED_CITY_TYPES.has(c.type))
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0) || a.name.localeCompare(b.name))
    .map((c) => ({
      id: c.id,
      name: c.name,
      stateName: c.state_code ? (stateNames.get(c.state_code) ?? null) : null,
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
    }));
}
