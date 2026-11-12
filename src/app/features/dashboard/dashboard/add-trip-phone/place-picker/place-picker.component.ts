import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import {
  CityOption,
  CountryOption,
  PlacesService,
} from '../../../../../core/services/places.service';
import { FlagComponent } from '../../../../../shared/components/flag/flag.component';
import {
  PickedPlace,
  filterByName,
  newPlaceFor,
  placeFromCity,
} from '../../add-trip-shared/trip-form';
import { VisitedCountry, cityKey, count } from '../../add-trip-shared/visited';

// A country can have thousands of cities; the list is capped while nothing narrows it
const MAX_CITY_OPTIONS = 50;

export type PickerStep = 'countries' | 'cities';

type CitiesState =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; cities: CityOption[] };

/**
 * Where the trip was, as two full-screen searches (Material 3's search view on a phone): a country, then one
 * of its cities. Countries already visited come first. Any typed name that isn't a listed city can be added
 * as a new place, pinned at the country's centre, which also covers countries with no cities in the dataset.
 */
@Component({
  selector: 'app-place-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatListModule, FlagComponent],
  templateUrl: './place-picker.component.html',
  styleUrl: './place-picker.component.css',
})
export class PlacePickerComponent {
  private places = inject(PlacesService);
  private injector = inject(Injector);

  readonly visited = input<readonly VisitedCountry[]>([]);
  /** Which search is showing; a model so the dialog can step back on the phone's back gesture */
  readonly step = model<PickerStep>('countries');
  readonly picked = output<PickedPlace>();
  /** Back from the country search: leave the picker */
  readonly closed = output<void>();

  protected readonly query = signal('');
  protected readonly country = signal<CountryOption | null>(null);
  private readonly search = viewChild.required<ElementRef<HTMLInputElement>>('search');

  private readonly allCountries = toSignal(
    this.places.getCountries().pipe(catchError(() => of(null))),
  );
  protected readonly countriesLoading = computed(() => this.allCountries() === undefined);
  protected readonly countriesFailed = computed(() => this.allCountries() === null);

  protected readonly visitedOptions = computed(() => {
    const byCode = new Map((this.allCountries() ?? []).map((c) => [c.isoCode, c]));
    return this.visited().flatMap((v) => {
      const country = byCode.get(v.isoCode);
      return country ? [{ country, summary: v.summary }] : [];
    });
  });
  protected readonly countryOptions = computed(() =>
    filterByName(this.allCountries() ?? [], this.query()),
  );

  protected readonly retryCities$ = new Subject<void>();
  protected readonly citiesState = toSignal(
    toObservable(this.country).pipe(
      switchMap((country) =>
        country
          ? this.retryCities$.pipe(
              startWith(undefined),
              switchMap(() =>
                this.places.getCities(country.isoCode).pipe(
                  map((cities): CitiesState => ({ status: 'ready', cities })),
                  startWith<CitiesState>({ status: 'loading' }),
                  catchError(() => of<CitiesState>({ status: 'error' })),
                ),
              ),
            )
          : of<CitiesState>({ status: 'idle' }),
      ),
    ),
    { initialValue: { status: 'idle' } as CitiesState },
  );
  private readonly allCities = computed(() => {
    const state = this.citiesState();
    return state.status === 'ready' ? state.cities : [];
  });
  protected readonly noCityList = computed(() => {
    const state = this.citiesState();
    return state.status === 'ready' && !state.cities.length;
  });

  protected readonly cityOptions = computed(() => {
    const trips =
      this.visited().find((v) => v.isoCode === this.country()?.isoCode)?.cityTrips ?? new Map();
    return filterByName(this.allCities(), this.query(), MAX_CITY_OPTIONS).map((city) => ({
      city,
      trips: trips.get(cityKey(city.name, city.stateName)) ?? 0,
    }));
  });
  protected readonly cityCount = computed(() => {
    const n = this.query().trim() ? this.cityOptions().length : this.allCities().length;
    return this.query().trim() ? `${n} found` : count(n, 'city', 'cities');
  });

  /** The typed text as a new place (see newPlaceFor), once the cities have loaded */
  protected readonly newPlace = computed(() => {
    const country = this.country();
    if (!country || this.citiesState().status !== 'ready') return null;
    return newPlaceFor(country, this.allCities(), this.query());
  });

  protected readonly searchLabel = computed(() => {
    const country = this.country();
    return this.step() === 'cities' && country ? `Search ${country.name}` : 'Search countries';
  });

  constructor() {
    // Each search starts empty, with the keyboard up
    effect(() => {
      this.step();
      untracked(() => {
        this.query.set('');
        afterNextRender(() => this.search().nativeElement.focus(), { injector: this.injector });
      });
    });
  }

  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected clear(): void {
    this.query.set('');
    this.search().nativeElement.focus();
  }

  protected back(): void {
    if (this.step() === 'cities') {
      this.step.set('countries');
    } else {
      this.closed.emit();
    }
  }

  protected pickCountry(country: CountryOption): void {
    this.country.set(country);
    this.step.set('cities');
  }

  protected pickCity(city: CityOption): void {
    this.picked.emit(placeFromCity(this.country()!, city));
  }

  protected addNewPlace(place: PickedPlace): void {
    this.picked.emit(place);
  }
}
