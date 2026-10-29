import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CountryShape, WorldService, countryFocus, landShare } from './world.service';

// Axis-aligned "boxes" in degrees; on a sphere a box's area grows with the sine of its latitudes
function box(
  iso: string,
  lng: number,
  lat: number,
  width: number,
  height: number,
  holes: number[][][] = [],
) {
  const ring = [
    [lng, lat],
    [lng + width, lat],
    [lng + width, lat + height],
    [lng, lat + height],
    [lng, lat],
  ];
  return {
    type: 'Feature',
    properties: { iso, name: iso },
    geometry: { type: 'Polygon', coordinates: [ring, ...holes] },
  } as CountryShape;
}

describe('landShare', () => {
  it('is the visited share of the total area', () => {
    const shapes = [box('AA', 0, 0, 10, 10), box('BB', 20, 0, 10, 10)];

    expect(landShare(shapes, new Set(['AA']))).toBeCloseTo(0.5, 5);
    expect(landShare(shapes, new Set(['AA', 'BB']))).toBeCloseTo(1, 5);
    expect(landShare(shapes, new Set())).toBe(0);
  });

  it('accounts for the sphere: the same box in degrees is smaller near the poles', () => {
    const shapes = [box('EQ', 0, 0, 10, 10), box('NORTH', 0, 70, 10, 10)];

    expect(landShare(shapes, new Set(['NORTH']))).toBeLessThan(0.3);
  });

  it('subtracts holes and adds every polygon of a multipolygon', () => {
    const hole = [
      [2, 2],
      [2, 4],
      [4, 4],
      [4, 2],
      [2, 2],
    ];
    const withHole = box('AA', 0, 0, 10, 10, [hole]);
    const islands: CountryShape = {
      type: 'Feature',
      properties: { iso: 'BB', name: 'BB' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          box('x', 20, 0, 10, 10).geometry.coordinates as number[][][],
          box('y', 40, 0, 10, 10).geometry.coordinates as number[][][],
        ],
      },
    };

    const share = landShare([withHole, islands], new Set(['BB']));

    // BB is two full boxes, AA is one box minus 4% of it
    expect(share).toBeCloseTo(2 / (2 + 0.96), 2);
  });

  it('is 0 when there are no shapes', () => {
    expect(landShare([], new Set(['DE']))).toBe(0);
  });
});

describe('WorldService', () => {
  it('loads the shapes file once and shares it', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(WorldService);
    const httpTesting = TestBed.inject(HttpTestingController);
    const results: number[] = [];

    service.getShapes().subscribe((world) => results.push(world.features.length));
    service.getShapes().subscribe((world) => results.push(world.features.length));

    httpTesting
      .expectOne('data/countries-110m.geojson')
      .flush({ type: 'FeatureCollection', features: [box('AA', 0, 0, 1, 1)] });
    expect(results).toEqual([1, 1]);
    httpTesting.verify();
  });
});

describe('countryFocus', () => {
  it('centres on the largest landmass, not a box around every island and overseas region', () => {
    const france: CountryShape = {
      type: 'Feature',
      properties: { iso: 'FR', name: 'France' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          box('x', -5, 42, 13, 9).geometry.coordinates as number[][][], // mainland
          box('y', -54, 2, 2, 4).geometry.coordinates as number[][][], // French Guiana
        ],
      },
    };

    const focus = countryFocus('FR', [france], [])!;

    expect(focus.lat).toBeCloseTo(46.5, 5);
    expect(focus.lng).toBeCloseTo(1.5, 5);
  });

  it('zooms out further for bigger countries', () => {
    const small = countryFocus('AA', [box('AA', 0, 50, 5, 4)], [])!;
    const big = countryFocus('BB', [box('BB', 60, 40, 120, 35)], [])!;

    expect(small.altitude).toBe(0.7);
    expect(big.altitude).toBeGreaterThan(1.5);
    expect(big.altitude).toBeLessThanOrEqual(2.6);
  });

  it('falls back to the visited cities for countries without a shape', () => {
    const focus = countryFocus(
      'MT',
      [],
      [
        { latitude: 35.9, longitude: 14.5 },
        { latitude: 36.1, longitude: 14.3 },
      ],
    );

    expect(focus!.lat).toBeCloseTo(36, 5);
    expect(focus!.lng).toBeCloseTo(14.4, 5);
    expect(focus!.altitude).toBe(0.7);
  });

  it('is null when there is nothing to aim at', () => {
    expect(countryFocus('MT', [], [])).toBeNull();
  });
});
