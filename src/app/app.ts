import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {SwUpdate} from '@angular/service-worker';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('PlacesBeenUi');

  constructor(private swUpdate: SwUpdate) {}

  ngOnInit() {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe(event => {
        if (event.type === 'VERSION_READY') {
          if (confirm('A fresh update is available! Would you like to reload the app?')) {
            window.location.reload();
          }
        }
      });
    }
  }
}
