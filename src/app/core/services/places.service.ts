import { Injectable } from '@angular/core';
import { defer, forkJoin, map, Observable, shareReplay } from 'rxjs';
import {
  ICity,
  ICountry,
  IState,
  getAllCitiesOfCountry,
  getCountries,
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
        map(({ cities, states }) => toCityOptions(cities, states)),
        shareReplay(1),
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

export function toCityOptions(
  cities: Pick<ICity, 'name' | 'state_code' | 'latitude' | 'longitude'>[],
  states: Pick<IState, 'iso2' | 'name'>[],
): CityOption[] {
  const stateNames = new Map(states.map((s) => [s.iso2, s.name]));
  return cities
    .map((c) => ({
      name: c.name,
      stateName: c.state_code ? (stateNames.get(c.state_code) ?? null) : null,
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
