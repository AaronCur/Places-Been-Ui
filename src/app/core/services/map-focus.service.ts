import { Injectable, signal } from '@angular/core';

export interface MapFocus {
  lat: number;
  lng: number;
  /** Camera height in globe radii: ~1.5 shows a country, ~0.6 a city */
  altitude: number;
}

// "Look here" requests for the globe from parts of the app that don't know about it (the add dialog now,
// trips in the list later). The dashboard passes `target` to the globe, which flies to each new value.
@Injectable({
  providedIn: 'root',
})
export class MapFocusService {
  private readonly _target = signal<MapFocus | null>(null);
  readonly target = this._target.asReadonly();

  focus(target: MapFocus): void {
    // A fresh object every time, so asking for the same place twice still moves the camera back there
    this._target.set({ ...target });
  }
}
