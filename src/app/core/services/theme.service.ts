import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'places-been-theme';

// Light/dark follows the system unless the user picks one. The palette itself is CSS (material-theme.scss):
// this only sets data-theme on <html>, which switches `color-scheme`, which every light-dark() token follows.
@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private document = inject(DOCUMENT);
  private media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private systemDark = signal(this.media?.matches ?? false);

  readonly preference = signal<ThemePreference>(readStoredPreference());
  readonly isDark = computed(() =>
    this.preference() === 'system' ? this.systemDark() : this.preference() === 'dark',
  );

  constructor() {
    this.media?.addEventListener('change', (e) => this.systemDark.set(e.matches));

    effect(() => {
      const preference = this.preference();
      const root = this.document.documentElement;
      if (preference === 'system') {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', preference);
      }
      try {
        localStorage.setItem(STORAGE_KEY, preference);
      } catch {
        // Storage can be blocked (private mode); the choice then lasts for this visit only
      }
    });
  }

  /** system → light → dark → system */
  cycle(): void {
    const next: Record<ThemePreference, ThemePreference> = {
      system: 'light',
      light: 'dark',
      dark: 'system',
    };
    this.preference.update((p) => next[p]);
  }
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}
