// src/app/core/services/travel.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {CountryResponse, DashboardSummaryResponse} from '../models/travel.model';

@Injectable({
  providedIn: 'root'
})
export class TravelService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:8080/api'; // Swap with your Spring Boot root URL

  // Fetch countries (with option to nested cities)
  getCountries(includeCities: boolean = false): Observable<CountryResponse[]> {
    return this.http.get<CountryResponse[]>(`${this.apiUrl}/countries?includeCities=${includeCities}`);
  }

  // Fetch aggregate stats for the dashboard header
  getStatsSummary(): Observable<DashboardSummaryResponse> {
    return this.http.get<DashboardSummaryResponse>(`${this.apiUrl}/stats/summary`);
  }

  // Handle city deletions
  deleteCity(cityId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/cities/${cityId}`);
  }
}
