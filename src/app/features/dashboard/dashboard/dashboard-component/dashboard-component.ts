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
import {
  Subject,
  catchError,
  filter,
  finalize,
  forkJoin,
  from,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';
import { CountryResponse, StatsSummaryResponse } from '../../../../core/models/travel.model';
import { TripResponse } from '../../../../core/models/trip.model';
import { cityLabels } from '../../../../core/models/city-label';
import { TripService } from '../../../../core/services/trip.service';
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
} from '../add-trip-dialog-component/docked-dialog';

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
  private tripService = inject(TripService);
  private worldService = inject(WorldService);
  private injector = inject(Injector);
  private snackBar = inject(MatSnackBar);
  private destroyRef = inject(DestroyRef);
  protected theme = inject(ThemeService);
  protected mapFocus = inject(MapFocusService);

  // One load for the panel; the list, the globe and the land stat are all derived from `countries`, and the
  // trip counts from `trips`. Countries stay the source of the places because cities added before trips existed
  // have none. `state` is the latest load's status. Loaded data stays on screen through a refresh, even a failed one.
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly reload$ = new Subject<void>();
  protected readonly stats = signal<StatsSummaryResponse | null>(null);
  protected readonly countries = signal<CountryResponse[]>([]);
  protected readonly trips = signal<TripResponse[]>([]);
  /** Each city's trips by city id, newest first (the API's order is kept) */
  protected readonly tripsByCity = computed(() => {
    const byCity = new Map<number, TripResponse[]>();
    for (const trip of this.trips()) {
      const list = byCity.get(trip.city.id);
      if (list) list.push(trip);
      else byCity.set(trip.city.id, [trip]);
    }
    return byCity as ReadonlyMap<number, readonly TripResponse[]>;
  });
  protected readonly shapes = signal<CountryShape[]>([]);
  protected readonly selectedCountry = signal<string | null>(null);

  protected readonly visitedCodes = computed(
    () => new Set(this.countries().map((country) => country.isoCode)),
  );
  protected readonly markers = computed<GlobeMarker[]>(() =>
    this.countries().flatMap((country) => {
      const labels = cityLabels(country.cities ?? []);
      return (country.cities ?? []).map((city) => {
        const trips = this.tripsByCity().get(city.id)?.length ?? 0;
        const place = `${labels.get(city.id)}, ${country.name}`;
        return {
          lat: city.latitude,
          lng: city.longitude,
          label: trips ? `${place} · ${trips === 1 ? '1 trip' : `${trips} trips`}` : place,
        };
      });
    }),
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
  private addDialogOpen = false;
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
    // Every reload goes through one stream: switchMap cancels the previous request, so a slow older response
    // can't overwrite a newer one. The error is caught inside it, or one failure would end the stream.
    this.reload$
      .pipe(
        tap(() => this.state.set('loading')),
        switchMap(() =>
          forkJoin({
            stats: this.travelService.getStatsSummary(),
            countries: this.travelService.getCountries(true),
            trips: this.tripService.getTrips(),
          }).pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((loaded) => {
        if (loaded) {
          this.stats.set(loaded.stats);
          this.countries.set(loaded.countries);
          this.trips.set(loaded.trips);
        }
        this.state.set(loaded ? 'ready' : 'error');
      });
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
    this.reload$.next();
  }

  // Opening a country in the list turns the globe to it. Globe clicks don't (it's already in view), and
  // neither does adding a trip (the dialog has already flown there).
  protected selectFromList(isoCode: string | null): void {
    this.selectedCountry.set(isoCode);
    const country = this.countries().find((c) => c.isoCode === isoCode);
    if (!country) return;
    const focus = countryFocus(country.isoCode, this.shapes(), country.cities ?? []);
    if (focus) this.mapFocus.focus(focus);
  }

  // The dialog, MatDialog and the form/autocomplete modules are one lazy chunk, downloaded on the first click
  protected openAddTrip(): void {
    if (this.addDialogOpen) return; // a second click while that chunk is on its way
    this.addDialogOpen = true;

    const placement: DialogPlacement = this.isDesktop() ? 'docked' : 'centered';
    from(import('../add-trip-dialog-component/add-trip-dialog-component'))
      .pipe(
        switchMap(({ openAddTripDialog }) => {
          // Only now, as the dialog appears: on the first click the lazy chunk takes a moment to arrive,
          // and the globe shouldn't start sliding before there's a dialog to make room for
          this.dialogDocked.set(placement === 'docked');
          return openAddTripDialog(this.injector, placement);
        }),
        finalize(() => {
          this.addDialogOpen = false;
          this.dialogDocked.set(false);
        }),
        filter((created) => !!created),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (trip) => {
          this.selectedCountry.set(trip.country.isoCode);
          this.snackBar.open(`${trip.city.name} trip added`, undefined, { duration: 3000 });
          this.load();
        },
        error: () =>
          this.snackBar.open('Couldn’t open the form. Check your connection and try again.', 'OK', {
            duration: 6000,
          }),
      });
  }

  // Delete straight away and offer Undo (the design's pattern) instead of asking for confirmation first
  protected deleteCity({ city, country }: CityDeleteRequest): void {
    const label = cityLabels(country.cities ?? []).get(city.id) ?? city.name;
    this.travelService
      .deleteCity(city.id)
      .pipe(
        switchMap(() => {
          this.load();
          return this.snackBar.open(`${label} deleted`, 'Undo', { duration: 6000 }).onAction();
        }),
        switchMap(() =>
          this.travelService.addCity({
            name: city.name,
            // Without it Undo would bring "Portland, Maine" back as a Portland with no state
            state: city.state ?? null,
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
