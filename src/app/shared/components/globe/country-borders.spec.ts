import { CountryShape } from '../../../core/services/world.service';
import { borderPositions, toCartesian } from './country-borders';

const square = (iso: string, lng: number, lat: number, size: number): CountryShape => ({
  type: 'Feature',
  properties: { iso, name: iso },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [lng, lat],
        [lng + size, lat],
        [lng + size, lat + size],
        [lng, lat + size],
        [lng, lat],
      ],
    ],
  },
});

/** The positions as points: [x, y, z] */
const points = (positions: Float32Array) =>
  Array.from({ length: positions.length / 3 }, (_, i) => [...positions.slice(i * 3, i * 3 + 3)]);
const radius = ([x, y, z]: number[]) => Math.hypot(x, y, z);

describe('toCartesian', () => {
  it('places points as three-globe does: lat 0, lng 0 on +z, the north pole on +y', () => {
    const [x, y, z] = toCartesian(0, 0);
    expect([x, y, z].map((v) => Math.round(v))).toEqual([0, 0, 100]);
    expect(toCartesian(90, 0)[1]).toBeCloseTo(100, 6);
    expect(toCartesian(0, 90)[0]).toBeCloseTo(100, 6);
  });

  it('lifts a point by its altitude in globe radii', () => {
    expect(radius(toCartesian(10, 20, 0.5))).toBeCloseTo(150, 4);
  });
});

describe('borderPositions', () => {
  it('draws each edge of a ring as a pair of points (a line segment)', () => {
    const positions = borderPositions([square('AA', 0, 0, 1)], () => 0);

    // 4 edges, none long enough to split: 4 segments of 2 points
    expect(points(positions)).toHaveLength(8);
    expect(points(positions)[0].map((v) => +v.toFixed(3))).toEqual(
      toCartesian(0, 0, 1e-4).map((v) => +v.toFixed(3)),
    );
  });

  it('puts each country’s border at its own altitude, just above its surface', () => {
    const raised = square('UP', 0, 0, 1);
    const flat = square('FL', 10, 0, 1);

    const positions = borderPositions([raised, flat], (s) => (s === raised ? 0.012 : 0.006));
    const radii = points(positions).map(radius);

    expect(radii.slice(0, 8).every((r) => Math.abs(r - 101.21) < 0.001)).toBe(true);
    expect(radii.slice(8).every((r) => Math.abs(r - 100.61) < 0.001)).toBe(true);
  });

  it('splits long edges so they follow the curve instead of cutting under the surface', () => {
    const big = square('BG', 0, 0, 10); // 10° edges: 5 steps of 2° each

    expect(points(borderPositions([big], () => 0))).toHaveLength(4 * 5 * 2);
  });

  it('covers every polygon of a multi-part country, and skips an edge along the date line', () => {
    const islands: CountryShape = {
      type: 'Feature',
      properties: { iso: 'FJ', name: 'Fiji' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [179, -17],
              [180, -17],
              [179, -16],
              [179, -17],
            ],
          ],
          [
            [
              [-180, -17],
              [180, -16],
              [-180, -16],
              [-180, -17],
            ],
          ], // two date-line jumps
        ],
      },
    };

    // First polygon: 3 short edges. Second: 3 edges, 2 of them jumping ±180°, so 1 drawn.
    expect(points(borderPositions([islands], () => 0))).toHaveLength((3 + 1) * 2);
  });
});
