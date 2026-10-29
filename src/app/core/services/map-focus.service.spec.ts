import { TestBed } from '@angular/core/testing';
import { MapFocusService } from './map-focus.service';

describe('MapFocusService', () => {
  it('starts with nothing to focus on', () => {
    expect(TestBed.inject(MapFocusService).target()).toBeNull();
  });

  it('holds the latest request, as a new value even for the same place', () => {
    const service = TestBed.inject(MapFocusService);
    const rome = { lat: 41.9, lng: 12.5, altitude: 0.6 };

    service.focus(rome);
    const first = service.target();
    service.focus(rome);

    expect(service.target()).toEqual(rome);
    // A new object means the globe's effect sees a change and flies back there
    expect(service.target()).not.toBe(first);
  });
});
