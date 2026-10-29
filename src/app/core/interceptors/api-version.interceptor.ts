import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const API_VERSION = '1';

// The API picks the endpoint version from this header (Spring Framework 7 API versioning).
// Only our API gets it: other hosts would reject the unknown header in a CORS preflight.
export const apiVersionInterceptor: HttpInterceptorFn = (req, next) =>
  req.url.startsWith(`${environment.apiUrl}/api/`)
    ? next(req.clone({ setHeaders: { 'Api-Version': API_VERSION } }))
    : next(req);
