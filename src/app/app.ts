import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { filter, switchMap } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private swUpdate = inject(SwUpdate);
  private snackBar = inject(MatSnackBar);

  constructor() {
    if (!this.swUpdate.isEnabled) return;

    // A new version was downloaded in the background: offer a reload instead of a blocking confirm()
    this.swUpdate.versionUpdates
      .pipe(
        filter((event) => event.type === 'VERSION_READY'),
        switchMap(() =>
          this.snackBar.open('A new version is available', 'Reload', { duration: 0 }).onAction(),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(() => window.location.reload());
  }
}
