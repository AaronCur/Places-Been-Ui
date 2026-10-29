import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TravelService } from './travel.service';
import { environment } from '../../../environments/environment';
import { CityResponse, CountryResponse } from '../models/travel.model';

describe('TravelService', () => {
  const api = `${environment.apiUrl}/api`;
  let service: TravelService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TravelService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('getCountries asks for nested cities when requested', () => {
    const germany: CountryResponse = {
      id: 1,
      name: 'Germany',
      isoCode: 'DE',
      flag: '🇩🇪',
      cities: [],
    };
    let result: CountryResponse[] | undefined;

    service.getCountries(true).subscribe((countries) => (result = countries));

    const req = httpTesting.expectOne(`${api}/countries?includeCities=true`);
    expect(req.request.method).toBe('GET');
    req.flush([germany]);
    expect(result).toEqual([germany]);
  });

  it('getCountries leaves cities out by default', () => {
    service.getCountries().subscribe();

    httpTesting.expectOne(`${api}/countries?includeCities=false`).flush([]);
  });

  it('getStatsSummary reads the summary', () => {
    let total: number | undefined;

    service.getStatsSummary().subscribe((stats) => (total = stats.totalCountries));

    httpTesting.expectOne(`${api}/stats/summary`).flush({ totalCountries: 2, totalCities: 3 });
    expect(total).toBe(2);
  });

  it('addCity posts the request body and returns the created city', () => {
    const request = { name: 'Berlin', countryCode: 'DE', latitude: 52.52, longitude: 13.405 };
    const created: CityResponse = { id: 7, ...request, country: 'Germany', countryFlag: '🇩🇪' };
    let result: CityResponse | undefined;

    service.addCity(request).subscribe((city) => (result = city));

    const req = httpTesting.expectOne(`${api}/cities`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(created, { status: 201, statusText: 'Created' });
    expect(result).toEqual(created);
  });

  it('deleteCity sends a DELETE for that id', () => {
    let done = false;

    service.deleteCity(7).subscribe(() => (done = true));

    const req = httpTesting.expectOne(`${api}/cities/7`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
  });
});
