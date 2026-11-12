// Every country's border as one set of line segments, so the globe draws all borders in a single draw call.
// globe.gl's own polygon strokes are one three.js object (one draw call) per country: ~290 of them, which was
// about a third of the globe's per-frame CPU cost. The maths only; the three.js object is in border-lines.ts,
// which loads with globe.gl so three.js stays out of the initial bundle.
import { CountryShape } from '../../../core/services/world.service';

/** three-globe's globe radius, in scene units */
const GLOBE_RADIUS = 100;
// A little above the country's surface so the surface can't hide the line. globe.gl's strokes used 1e-4 (0.01
// units), which phone GPUs, with less precise depth, can't always tell apart from the surface: the borders broke
// up and flickered. 0.1 units clears that and is still far too small to see as a gap.
export const ABOVE_SURFACE = 1e-3;
// Long edges are split so the straight chord between their ends doesn't cut below the curved surface
const MAX_STEP_DEG = 2;

/** A point on (or `altitude` globe radii above) the globe, placed exactly as three-globe places its layers */
export function toCartesian(lat: number, lng: number, altitude = 0): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lng) * Math.PI) / 180;
  const r = GLOBE_RADIUS * (1 + altitude);
  return [
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ];
}

/**
 * Line-segment vertex positions (x, y, z per point, two points per segment) for every ring of every country,
 * each at that country's altitude, so a raised (visited) country's border sits on its raised surface. Edges
 * longer than MAX_STEP_DEG are split along the way.
 */
export function borderPositions(
  shapes: readonly CountryShape[],
  altitudeOf: (shape: CountryShape) => number,
): Float32Array {
  const out: number[] = [];
  for (const shape of shapes) {
    const altitude = altitudeOf(shape) + ABOVE_SURFACE;
    const polygons =
      shape.geometry.type === 'Polygon' ? [shape.geometry.coordinates] : shape.geometry.coordinates;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (let i = 1; i < ring.length; i++) {
          const [lng0, lat0] = ring[i - 1];
          const [lng1, lat1] = ring[i];
          // An edge jumping from +180° to -180° is the date line, not a border: interpolating it would draw
          // a line the long way round the globe
          if (Math.abs(lng1 - lng0) > 180) continue;
          const steps = Math.max(
            1,
            Math.ceil(Math.max(Math.abs(lat1 - lat0), Math.abs(lng1 - lng0)) / MAX_STEP_DEG),
          );
          let prev = toCartesian(lat0, lng0, altitude);
          for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const next = toCartesian(lat0 + (lat1 - lat0) * t, lng0 + (lng1 - lng0) * t, altitude);
            out.push(...prev, ...next);
            prev = next;
          }
        }
      }
    }
  }
  return new Float32Array(out);
}
