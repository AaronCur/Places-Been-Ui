import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CityRequest,
  CityResponse,
  CountryResponse,
  StatsSummaryResponse,
} from '../models/travel.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class TravelService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  // Visited countries only (those with at least one city), sorted by name
  getCountries(includeCities = false): Observable<CountryResponse[]> {
    return this.http.get<CountryResponse[]>(`${this.apiUrl}/api/countries`, {
      params: { includeCities },
    });
  }

  getStatsSummary(): Observable<StatsSummaryResponse> {
    return this.http.get<StatsSummaryResponse>(`${this.apiUrl}/api/stats/summary`);
  }

  addCity(city: CityRequest): Observable<CityResponse> {
    return this.http.post<CityResponse>(`${this.apiUrl}/api/cities`, city);
  }

  deleteCity(cityId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/api/cities/${cityId}`);
  }
}
