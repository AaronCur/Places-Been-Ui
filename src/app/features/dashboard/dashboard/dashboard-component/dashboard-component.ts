import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, filter, finalize, forkJoin, from, map, of, switchMap } from 'rxjs';
import { CountryResponse, StatsSummaryResponse } from '../../../../core/models/travel.model';
import { MapFocusService } from '../../../../core/services/map-focus.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { TravelService } from '../../../../core/services/travel.service';
import {
  CountryShape,
  WorldService,
  countryFocus,
  landShare,
} from '../../../../core/services/world.service';
import { SOVEREIGN_STATES } from '../../../../core/data/sovereign-states';
import { GlobeComponent, GlobeMarker } from '../../../../shared/components/globe/globe.component';
import {
  CityDeleteRequest,
  CountryListComponent,
} from '../country-list-component/country-list-component';
import { StatsCardsComponent } from '../stats-cards-component/stats-cards-component';
import {
  DESKTOP_QUERY,
  DOCKED_DIALOG_INSET,
  DialogPlacement,
} from '../add-city-dialog-component/docked-dialog';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    CountryListComponent,
    GlobeComponent,
    StatsCardsComponent,
  ],
  templateUrl: './dashboard-component.html',
  styleUrls: ['./dashboard-component.css'],
})
export class DashboardComponent {
  private travelService = inject(TravelService);
  private worldService = inject(WorldService);
  private injector = inject(Injector);
  private snackBar = inject(MatSnackBar);
  private destroyRef = inject(DestroyRef);
  protected theme = inject(ThemeService);
  protected mapFocus = inject(MapFocusService);

  // One load for the panel; the list, the globe and the land stat are all derived from `countries`
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly stats = signal<StatsSummaryResponse | null>(null);
  protected readonly countries = signal<CountryResponse[]>([]);
  protected readonly shapes = signal<CountryShape[]>([]);
  protected readonly selectedCountry = signal<string | null>(null);

  protected readonly visitedCodes = computed(
    () => new Set(this.countries().map((country) => country.isoCode)),
  );
  protected readonly markers = computed<GlobeMarker[]>(() =>
    this.countries().flatMap((country) =>
      (country.cities ?? []).map((city) => ({
        lat: city.latitude,
        lng: city.longitude,
        label: `${city.name}, ${country.name}`,
      })),
    ),
  );
  protected readonly landShare = computed(() =>
    this.shapes().length ? landShare(this.shapes(), this.visitedCodes()) : null,
  );
  // "% of countries" counts sovereign states only; visited territories (Hong Kong…) don't add to it
  protected readonly sovereignTotal = SOVEREIGN_STATES.size;
  protected readonly sovereignVisited = computed(
    () => [...this.visitedCodes()].filter((code) => SOVEREIGN_STATES.has(code)).length,
  );

  // On desktop the add dialog opens to one side so the globe stays visible. When it docks over the globe's
  // right side, the globe re-centres in the space left of it.
  private readonly isDesktop = toSignal(
    inject(BreakpointObserver)
      .observe(DESKTOP_QUERY)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  private readonly dialogDocked = signal(false);
  protected readonly globeInset = computed(() => (this.dialogDocked() ? DOCKED_DIALOG_INSET : 0));

  protected readonly themeIcon = computed(
    () =>
      ({ system: 'brightness_auto', light: 'light_mode', dark: 'dark_mode' })[
        this.theme.preference()
      ],
  );
  protected readonly themeLabel = computed(
    () =>
      ({
        system: 'Theme: follows your system',
        light: 'Theme: light',
        dark: 'Theme: dark',
      })[this.theme.preference()],
  );

  constructor() {
    this.load();

    // Shapes are a static file; without them the globe and land stat stay empty, the rest still works
    this.worldService
      .getShapes()
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(),
      )
      .subscribe((world) => this.shapes.set(world?.features ?? []));
  }

  protected load(): void {
    this.state.set('loading');
    forkJoin({
      stats: this.travelService.getStatsSummary(),
      countries: this.travelService.getCountries(true),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ stats, countries }) => {
          this.stats.set(stats);
          this.countries.set(countries);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      });
  }

  // Opening a country in the list turns the globe to it. Globe clicks don't (it's already in view), and
  // neither does adding a city (the dialog has already flown there).
  protected selectFromList(isoCode: string | null): void {
    this.selectedCountry.set(isoCode);
    const country = this.countries().find((c) => c.isoCode === isoCode);
    if (!country) return;
    const focus = countryFocus(country.isoCode, this.shapes(), country.cities ?? []);
    if (focus) this.mapFocus.focus(focus);
  }

  // The dialog, MatDialog and the form/autocomplete modules are one lazy chunk, downloaded on the first click
  protected openAddCity(): void {
    const placement: DialogPlacement = this.isDesktop() ? 'docked' : 'centered';
    from(import('../add-city-dialog-component/add-city-dialog-component'))
      .pipe(
        switchMap(({ openAddCityDialog }) => {
          // Only now, as the dialog appears: on the first click the lazy chunk takes a moment to arrive,
          // and the globe shouldn't start sliding before there's a dialog to make room for
          this.dialogDocked.set(placement === 'docked');
          return openAddCityDialog(this.injector, placement);
        }),
        finalize(() => this.dialogDocked.set(false)),
        filter((created) => !!created),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((created) => {
        this.selectedCountry.set(created.countryCode ?? null);
        this.snackBar.open(`${created.name} added`, undefined, { duration: 3000 });
        this.load();
      });
  }

  // Delete straight away and offer Undo (the design's pattern) instead of asking for confirmation first
  protected deleteCity({ city, country }: CityDeleteRequest): void {
    this.travelService
      .deleteCity(city.id)
      .pipe(
        switchMap(() => {
          this.load();
          return this.snackBar.open(`${city.name} deleted`, 'Undo', { duration: 6000 }).onAction();
        }),
        switchMap(() =>
          this.travelService.addCity({
            name: city.name,
            countryCode: country.isoCode,
            latitude: city.latitude,
            longitude: city.longitude,
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.load(),
        error: () =>
          this.snackBar.open(`Couldn’t update ${city.name}. Please try again.`, 'OK', {
            duration: 6000,
          }),
      });
  }
}
