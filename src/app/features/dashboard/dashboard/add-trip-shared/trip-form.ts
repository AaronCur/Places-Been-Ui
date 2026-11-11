// Shared by the two Add trip dialogs (desktop: one form; phone: a summary with full-screen pickers). Plain
// functions and constants only, so either lazy dialog can use them without pulling in the other.
import { TripRequest } from '../../../../core/models/trip.model';
import { CityOption, CountryOption } from '../../../../core/services/places.service';
import { toIsoDate } from '../../../../core/dates/day-first-date-adapter';

// The API's limits (TripRequest)
export const MAX_NOTES = 2000;
export const MAX_CITY_NAME = 255;

/** Where the trip was: a city from the dataset, or a typed name pinned at its country's centre */
export interface PickedPlace {
  countryCode: string;
  countryName: string;
  cityName: string;
  state: string | null;
  latitude: number;
  longitude: number;
  /** Typed rather than picked, so the pin is only roughly right (the country's centre point) */
  approximate: boolean;
}

export function placeFromCity(country: CountryOption, city: CityOption): PickedPlace {
  return {
    countryCode: country.isoCode,
    countryName: country.name,
    cityName: city.name,
    state: city.stateName,
    latitude: city.latitude,
    longitude: city.longitude,
    approximate: false,
  };
}

/**
 * A typed place, pinned at the country's centre point. Null when the name is blank or too long, or the
 * dataset has no centre for the country (a few entries don't), since the API needs coordinates.
 */
export function placeAtCentre(country: CountryOption, typed: string): PickedPlace | null {
  const cityName = typed.trim();
  const located = Number.isFinite(country.latitude) && Number.isFinite(country.longitude);
  if (!cityName || cityName.length > MAX_CITY_NAME || !located) return null;
  return {
    countryCode: country.isoCode,
    countryName: country.name,
    cityName,
    state: null,
    latitude: country.latitude,
    longitude: country.longitude,
    approximate: true,
  };
}

/** The POST /api/trips body. No end date is a day trip; blank notes are left out. */
export function buildTripRequest(
  place: Pick<PickedPlace, 'countryCode' | 'cityName' | 'state' | 'latitude' | 'longitude'>,
  start: Date,
  end: Date | null,
  notes: string,
): TripRequest {
  return {
    cityName: place.cityName,
    state: place.state,
    countryCode: place.countryCode,
    latitude: place.latitude,
    longitude: place.longitude,
    startDate: toIsoDate(start),
    endDate: end ? toIsoDate(end) : null,
    notes: notes.trim() || null,
  };
}

/** After today, which a trip can't start on (the API's @PastOrPresent) */
export function isFuture(date: Date, now = new Date()): boolean {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  return date > endOfToday;
}

// The API's 400 lists every bad field as "field: message, field: message". Its field names, mapped to the part
// of the form the error belongs under, with the message to show there (the API's own are Bean Validation
// defaults).
export type ServerField = 'country' | 'city' | 'start' | 'end' | 'notes';
const SERVER_FIELDS: Record<string, { field: ServerField; message: string }> = {
  countryCode: { field: 'country', message: 'This country isn’t supported yet' },
  cityName: { field: 'city', message: 'Check the city name' },
  state: { field: 'city', message: 'Check the city' },
  latitude: { field: 'city', message: 'This place isn’t on the map. Try another city.' },
  longitude: { field: 'city', message: 'This place isn’t on the map. Try another city.' },
  startDate: { field: 'start', message: 'The trip can’t start in the future' },
  endDate: { field: 'end', message: 'The end can’t be before the start' },
  notes: { field: 'notes', message: `Notes can be up to ${MAX_NOTES} characters` },
};
export const NO_PIN_MESSAGE = SERVER_FIELDS['latitude'].message;

/**
 * The fields named in an API 400 message, with what to show under each. Handles the validation format
 * ("startDate: must be…, endDate: …") and the unknown-country one ("Unknown country code: XX").
 */
export function serverFieldErrors(message: string): Map<ServerField, string> {
  const errors = new Map<ServerField, string>();
  if (message.startsWith('Unknown country code')) {
    errors.set('country', SERVER_FIELDS['countryCode'].message);
    return errors;
  }
  // Split before each "field: " so commas inside a message don't break it up
  for (const part of message.split(/, (?=\w+: )/)) {
    const known = SERVER_FIELDS[part.slice(0, part.indexOf(':'))];
    if (known && !errors.has(known.field)) errors.set(known.field, known.message);
  }
  return errors;
}

/** What to show for a failed save that isn't about one field */
export function saveFailedMessage(status: number): string {
  return status === 0
    ? 'Can’t reach the server. Check your connection and try again.'
    : 'Something went wrong while saving. Please try again.';
}

/**
 * Options whose name, or any word in it, starts with the query ("korea" finds South Korea), names that start
 * with it first. `limit` keeps huge lists (a country's cities) from rendering thousands of options.
 */
export function filterByName<T extends { name: string }>(
  options: T[],
  query: T | string,
  limit = Infinity,
): T[] {
  const text = (typeof query === 'string' ? query : query.name).trim().toLocaleLowerCase();
  if (!text) return options.slice(0, limit);

  const starts: T[] = [];
  const wordStarts: T[] = [];
  for (const option of options) {
    const name = option.name.toLocaleLowerCase();
    if (name.startsWith(text)) {
      starts.push(option);
    } else if (name.split(/[\s\-'(]+/).some((word) => word.startsWith(text))) {
      wordStarts.push(option);
    }
  }
  return [...starts, ...wordStarts].slice(0, limit);
}
