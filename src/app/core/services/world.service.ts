import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { MapFocus } from './map-focus.service';

// Natural Earth 1:110m country shapes (public domain), stripped to what the globe needs.
// iso is ISO_A2_EH, because Natural Earth's plain ISO_A2 is -99 for France and Norway.
export interface CountryShape {
  type: 'Feature';
  properties: { iso: string; name: string };
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
}

export interface WorldShapes {
  type: 'FeatureCollection';
  features: CountryShape[];
}

@Injectable({
  providedIn: 'root',
})
export class WorldService {
  private http = inject(HttpClient);

  // A static file served with the app (public/data), not the API
  private shapes$ = this.http.get<WorldShapes>('data/countries-110m.geojson').pipe(shareReplay(1));

  getShapes(): Observable<WorldShapes> {
    return this.shapes$;
  }
}

/** Share of the world's land area (0–1) covered by the given countries, as drawn on the globe. */
export function landShare(shapes: CountryShape[], isoCodes: ReadonlySet<string>): number {
  let total = 0;
  let visited = 0;
  for (const shape of shapes) {
    const area = shapeArea(shape);
    total += area;
    if (isoCodes.has(shape.properties.iso)) visited += area;
  }
  return total === 0 ? 0 : visited / total;
}

function shapeArea(shape: CountryShape): number {
  const polygons =
    shape.geometry.type === 'Polygon' ? [shape.geometry.coordinates] : shape.geometry.coordinates;
  // The first ring is the outline, the rest are holes (lakes, enclaves)
  return polygons.reduce(
    (sum, [outline, ...holes]) =>
      sum + ringArea(outline) - holes.reduce((h, hole) => h + ringArea(hole), 0),
    0,
  );
}

// Area of a [lng, lat] ring on the unit sphere, by the spherical-excess approximation used by
// most GIS tools (Chamberlain & Duquette). Only ratios are needed, so the Earth's radius cancels out.
function ringArea(ring: number[][]): number {
  const rad = Math.PI / 180;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    sum += (lng2 - lng1) * rad * (2 + Math.sin(lat1 * rad) + Math.sin(lat2 * rad));
  }
  return Math.abs(sum / 2);
}

/**
 * Where to point the globe to show a country: the centre of its largest landmass (so France means mainland
 * France, not a box stretched to French Guiana), from higher up for bigger countries. Countries missing
 * from the 1:110m shapes (Malta, Singapore…) fall back to the visited cities' midpoint. Null if neither.
 */
export function countryFocus(
  isoCode: string,
  shapes: CountryShape[],
  cities: { latitude: number; longitude: number }[],
): MapFocus | null {
  const shape = shapes.find((s) => s.properties.iso === isoCode);
  if (shape) {
    const polygons =
      shape.geometry.type === 'Polygon' ? [shape.geometry.coordinates] : shape.geometry.coordinates;
    const mainland = polygons.reduce((largest, polygon) =>
      ringArea(polygon[0]) > ringArea(largest[0]) ? polygon : largest,
    );
    const lngs = mainland[0].map(([lng]) => lng);
    const lats = mainland[0].map(([, lat]) => lat);
    const [west, east, south, north] = [
      Math.min(...lngs),
      Math.max(...lngs),
      Math.min(...lats),
      Math.max(...lats),
    ];
    // Longitude degrees shrink towards the poles, so weigh the width by the latitude it sits at
    const midLat = (south + north) / 2;
    const extent = Math.max(north - south, (east - west) * Math.cos((midLat * Math.PI) / 180));
    return { lat: midLat, lng: (west + east) / 2, altitude: altitudeFor(extent) };
  }
  if (cities.length) {
    const lat = cities.reduce((sum, c) => sum + c.latitude, 0) / cities.length;
    const lng = cities.reduce((sum, c) => sum + c.longitude, 0) / cities.length;
    return { lat, lng, altitude: altitudeFor(0) };
  }
  return null;
}

// Camera height (globe radii) that fits a country `extentDeg` across: Ireland ~0.7, the US ~1.5, Russia 2.6
function altitudeFor(extentDeg: number): number {
  return Math.min(2.6, Math.max(0.7, 0.4 + extentDeg / 45));
}
