// src/app/core/models/travel.models.ts
export interface CityResponse {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

export interface CountryResponse {
  id: number;
  name: string;
  flagEmoji?: string; // Optional field if you use one
  cities?: CityResponse[];
}

export interface DashboardSummaryResponse {
  totalCountries: number;
  totalCities: number;
}
