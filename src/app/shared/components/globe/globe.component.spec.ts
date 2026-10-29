import { TestBed } from '@angular/core/testing';
import { GlobeComponent } from './globe.component';

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
  });
});
