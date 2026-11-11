import { TestBed } from '@angular/core/testing';
import { GlobeComponent, altitudeToFit, slideStep } from './globe.component';

// jsdom has no WebGL, so the real globe can't start here; these cover the overlay and the fallback.
// The globe itself is checked by running the app (see the verification steps in the plan).
describe('GlobeComponent', () => {
  async function render() {
    const fixture = TestBed.createComponent(GlobeComponent);
    fixture.componentRef.setInput('shapes', []);
    fixture.componentRef.setInput('visitedCodes', new Set<string>());
    fixture.componentRef.setInput('markers', []);
    await fixture.whenStable();
    return fixture;
  }

  it('shows the legend straight away', async () => {
    const fixture = await render();
    const legend = fixture.nativeElement.querySelector('.legend') as HTMLElement;

    expect(legend.textContent).toContain('Visited');
    expect(legend.textContent).toContain('Not yet');
    expect(legend.textContent).toContain('City');
  });

  it('falls back to a message, not a broken canvas, when WebGL is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fixture = await render();

    await vi.waitFor(
      async () => {
        await fixture.whenStable();
        expect(fixture.nativeElement.textContent).toContain('needs WebGL');
      },
      { timeout: 10_000 },
    );
    expect(fixture.nativeElement.querySelector('[aria-label="Zoom in"]')).toBeNull();
    // globe.gl is a large import; under a full parallel test run it can take longer than the 5s default
  }, 15_000);
});

describe('slideStep', () => {
  it('runs from the start to the target', () => {
    expect(slideStep(0, 244, 0)).toBe(0);
    expect(slideStep(0, 244, 1)).toBe(244);
  });

  it('eases out: most of the distance is covered early', () => {
    expect(slideStep(0, 100, 0.5)).toBe(87.5);
  });

  it('slides back the same way', () => {
    expect(slideStep(244, 0, 1)).toBe(0);
    expect(slideStep(100, 0, 0.5)).toBe(12.5);
  });
});

describe('altitudeToFit', () => {
  it('fills a square view edge to edge from where the globe exactly spans the field of view', () => {
    // 90° view: the edges are 45° off-centre, and sin 45° = 1 / distance, so distance √2, altitude √2 − 1
    expect(altitudeToFit(500, 500, 1, 90)).toBeCloseTo(Math.SQRT2 - 1, 5);
  });

  it('is limited by the width in a tall (phone) view', () => {
    // Half as wide as tall: horizontal tan halves, tan(angle) = 0.5, distance √5
    expect(altitudeToFit(400, 800, 1, 90)).toBeCloseTo(Math.sqrt(5) - 1, 5);
    // A wider view of the same height doesn't change it once the height is the limit
    expect(altitudeToFit(1600, 800, 1, 90)).toBeCloseTo(altitudeToFit(800, 800, 1, 90), 5);
  });

  it('backs off to fill less of the view', () => {
    expect(altitudeToFit(400, 800, 0.9, 50)).toBeGreaterThan(altitudeToFit(400, 800, 1, 50));
  });
});
