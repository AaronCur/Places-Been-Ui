import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TripRequest, TripResponse, TripUpdateRequest } from '../models/trip.model';
import { environment } from '../../../environments/environment';

/** /api/trips. The Api-Version header is added by the interceptor, as for every API call. */
@Injectable({
  providedIn: 'root',
})
export class TripService {
  private http = inject(HttpClient);
  private tripsUrl = `${environment.apiUrl}/api/trips`;

  // Newest first (by start date), each with its city and country
  getTrips(): Observable<TripResponse[]> {
    return this.http.get<TripResponse[]>(this.tripsUrl);
  }

  addTrip(trip: TripRequest): Observable<TripResponse> {
    return this.http.post<TripResponse>(this.tripsUrl, trip);
  }

  updateTrip(id: number, changes: TripUpdateRequest): Observable<TripResponse> {
    return this.http.put<TripResponse>(`${this.tripsUrl}/${id}`, changes);
  }

  // Deleting a city's last trip deletes the city too (server side)
  deleteTrip(id: number): Observable<void> {
    return this.http.delete<void>(`${this.tripsUrl}/${id}`);
  }
}
