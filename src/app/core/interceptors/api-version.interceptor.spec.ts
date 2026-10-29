import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiVersionInterceptor } from './api-version.interceptor';
import { environment } from '../../../environments/environment';

describe('apiVersionInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiVersionInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('adds the Api-Version header to API requests', () => {
    http.get(`${environment.apiUrl}/api/cities`).subscribe();

    const req = httpTesting.expectOne(`${environment.apiUrl}/api/cities`);
    expect(req.request.headers.get('Api-Version')).toBe('1');
    req.flush([]);
  });

  it('leaves other requests alone, so other hosts never see the header', () => {
    http.get('data/countries-110m.geojson').subscribe();
    http.get('https://example.com/api/thing').subscribe();

    const shapes = httpTesting.expectOne('data/countries-110m.geojson');
    const otherHost = httpTesting.expectOne('https://example.com/api/thing');
    expect(shapes.request.headers.has('Api-Version')).toBe(false);
    expect(otherHost.request.headers.has('Api-Version')).toBe(false);
    shapes.flush({});
    otherHost.flush({});
  });
});
