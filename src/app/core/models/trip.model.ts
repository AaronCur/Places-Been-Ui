// Mirrors the API's trip records (travel.placesbeen.trip); field names must match its JSON exactly.
// Dates are ISO strings ("2026-10-12"), as Jackson writes a LocalDate. They stay strings here: a JS Date would
// add a time and a time zone, and "12 Oct" could turn into "11 Oct" west of UTC.

/** The trip's city, cut down to what the list and the globe need */
export interface TripCity {
  id: number;
  name: string;
  // Left out when the place has no state (e.g. Gibraltar)
  state?: string;
  latitude: number;
  longitude: number;
}

export interface TripCountry {
  isoCode: string;
  name: string;
  flag: string;
}

export interface TripResponse {
  id: number;
  startDate: string;
  // Left out for a day trip
  endDate?: string;
  notes?: string;
  city: TripCity;
  country: TripCountry;
}

/** POST /api/trips: the place is found or created by (cityName, state, countryCode) */
export interface TripRequest {
  cityName: string;
  state: string | null;
  countryCode: string;
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string | null;
  notes: string | null;
}

/** PUT /api/trips/{id}: only the dates and notes can change; to move a trip, delete it and add it again */
export interface TripUpdateRequest {
  startDate: string;
  endDate: string | null;
  notes: string | null;
}
