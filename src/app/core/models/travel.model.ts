// Mirrors the Places Been API's request/response records; field names must match its JSON exactly.

export interface CityResponse {
  id: number;
  name: string;
  // The dataset's state/region; left out when there is none (e.g. Gibraltar)
  state?: string;
  latitude: number;
  longitude: number;
  // Left out (null on the server) when the city is nested inside its CountryResponse
  country?: string;
  countryCode?: string;
  countryFlag?: string;
}

export interface CountryResponse {
  id: number;
  name: string;
  isoCode: string;
  flag: string;
  cities?: CityResponse[];
}

export interface StatsSummaryResponse {
  totalCountries: number;
  totalCities: number;
}

export interface CityRequest {
  name: string;
  // Tells same-name cities in one country apart (Portland, Oregon / Maine); null when there is none
  state: string | null;
  countryCode: string;
  latitude: number;
  longitude: number;
}

export interface ErrorResponse {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  path: string;
}
