import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TripService } from './trip.service';
import { environment } from '../../../environments/environment';
import { TripRequest, TripResponse, TripUpdateRequest } from '../models/trip.model';

const lisbonTrip: TripResponse = {
  id: 1,
  startDate: '2025-08-20',
  endDate: '2025-08-27',
  notes: 'Pastéis de nata',
  city: { id: 5, name: 'Lisbon', state: 'Lisbon', latitude: 38.722, longitude: -9.139 },
  country: { isoCode: 'PT', name: 'Portugal', flag: '🇵🇹' },
};

describe('TripService', () => {
  const trips = `${environment.apiUrl}/api/trips`;
  let service: TripService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TripService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('getTrips reads the list as the API orders it', () => {
    const dayTrip: TripResponse = {
      id: 2,
      startDate: '2026-03-10',
      city: { id: 7, name: 'Gibraltar', latitude: 36.14, longitude: -5.35 },
      country: { isoCode: 'GI', name: 'Gibraltar', flag: '🇬🇮' },
    };
    let result: TripResponse[] | undefined;

    service.getTrips().subscribe((list) => (result = list));

    const req = httpTesting.expectOne(trips);
    expect(req.request.method).toBe('GET');
    req.flush([dayTrip, lisbonTrip]);
    expect(result).toEqual([dayTrip, lisbonTrip]);
  });

  it('addTrip posts the request and returns the created trip', () => {
    const request: TripRequest = {
      cityName: 'Lisbon',
      state: 'Lisbon',
      countryCode: 'PT',
      latitude: 38.722,
      longitude: -9.139,
      startDate: '2025-08-20',
      endDate: '2025-08-27',
      notes: 'Pastéis de nata',
    };
    let result: TripResponse | undefined;

    service.addTrip(request).subscribe((trip) => (result = trip));

    const req = httpTesting.expectOne(trips);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(lisbonTrip, { status: 201, statusText: 'Created' });
    expect(result).toEqual(lisbonTrip);
  });

  it('updateTrip puts the new dates and notes to that trip', () => {
    const changes: TripUpdateRequest = { startDate: '2025-08-21', endDate: null, notes: null };
    let result: TripResponse | undefined;

    service.updateTrip(1, changes).subscribe((trip) => (result = trip));

    const req = httpTesting.expectOne(`${trips}/1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(changes);
    req.flush({ ...lisbonTrip, startDate: '2025-08-21', endDate: undefined, notes: undefined });
    expect(result?.startDate).toBe('2025-08-21');
  });

  it('deleteTrip sends a DELETE for that id', () => {
    let done = false;

    service.deleteTrip(1).subscribe(() => (done = true));

    const req = httpTesting.expectOne(`${trips}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
  });

  it('passes a server error on to the caller', () => {
    let status: number | undefined;

    service.deleteTrip(99).subscribe({ error: (err) => (status = err.status) });

    httpTesting
      .expectOne(`${trips}/99`)
      .flush({ message: 'Trip not found with id: 99' }, { status: 404, statusText: 'Not Found' });
    expect(status).toBe(404);
  });
});
