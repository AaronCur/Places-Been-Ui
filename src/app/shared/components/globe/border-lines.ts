// The countries' borders as a single three.js object (positions from country-borders.ts). Imported with
// import() next to globe.gl, never statically: that keeps three.js in the globe's lazy chunk instead of the
// initial bundle.
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments } from 'three';

export class BorderLines {
  readonly object = new LineSegments(new BufferGeometry(), new LineBasicMaterial());

  constructor() {
    this.object.raycast = () => undefined; // hover and clicks go to the countries underneath
  }

  /** New positions, e.g. after a country is visited and rises */
  update(positions: Float32Array): void {
    this.object.geometry.dispose();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.object.geometry = geometry;
  }

  setColor(color: string): void {
    this.object.material.color.set(color);
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}
