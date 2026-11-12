import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  Observable,
  Subject,
  catchError,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { ErrorResponse } from '../../../../core/models/travel.model';
import { TripResponse } from '../../../../core/models/trip.model';
import { provideDayFirstDates } from '../../../../core/dates/day-first-date-adapter';
import { CityOption, CountryOption, PlacesService } from '../../../../core/services/places.service';
import { MapFocusService } from '../../../../core/services/map-focus.service';
import { TripService } from '../../../../core/services/trip.service';
import { FlagComponent } from '../../../../shared/components/flag/flag.component';
import {
  MAX_NOTES,
  PickedPlace,
  ServerField,
  buildTripRequest,
  filterByName,
  isFuture,
  newPlaceFor,
  placeFromCity,
  saveFailedMessage,
  serverFieldErrors,
} from '../add-trip-shared/trip-form';
import { VisitedCountry, cityKey } from '../add-trip-shared/visited';
import { DOCKED_DIALOG_MARGIN, DOCKED_DIALOG_WIDTH } from './docked-dialog';

// All ~250 countries render fine; a country can have thousands of cities, so those are capped while typing
const MAX_CITY_OPTIONS = 50;
// Camera heights (globe radii) for the fly-to: close enough to see the country, then the city
const COUNTRY_ALTITUDE = 1.4;
const CITY_ALTITUDE = 0.6;
/**
 * Focusing the country field opens its list: ~260 options with flags, a few hundred ms of rendering. Done as
 * the dialog opened, that landed on the globe's 400ms slide and made it jump; this waits for the slide.
 */
export const COUNTRY_FOCUS_DELAY_MS = 450;

/**
 * Opens the dialog; emits the created trip, or undefined if cancelled. It lives in this (lazy) file so that
 * MatDialog itself, not just the component, stays out of the initial bundle: callers import() this file and
 * pass their injector instead of injecting MatDialog.
 *
 * It docks at the bottom right, just above the Add trip button, with a light backdrop, so the globe stays in
 * view and can be seen turning to the picked country. (Phones get add-trip-phone instead.)
 */
export function openAddTripDialog(
  injector: Injector,
  data: AddTripDialogData,
): Observable<TripResponse | undefined> {
  return injector
    .get(MatDialog)
    .open<AddTripDialogComponent, AddTripDialogData, TripResponse>(AddTripDialogComponent, {
      data,
      width: `${DOCKED_DIALOG_WIDTH}px`,
      position: { right: `${DOCKED_DIALOG_MARGIN}px`, bottom: '96px' },
      backdropClass: 'pb-light-backdrop',
      // The dialog itself; the country field follows once the globe has slid aside (COUNTRY_FOCUS_DELAY_MS)
      autoFocus: 'dialog',
    })
    .afterClosed();
}

export interface AddTripDialogData {
  /** The places already been, listed first ("Been before"), as on a phone */
  visited: readonly VisitedCountry[];
}

type CitiesState =
  { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; cities: CityOption[] };

// Picked options are objects; while the user is still typing, the control holds the text
const isPicked = <T extends object>(value: T | string): value is T => typeof value === 'object';
const picked = (control: AbstractControl): ValidationErrors | null =>
  isPicked(control.value) ? null : { notPicked: true };

// A trip can't start after today (the API's @PastOrPresent). A validator rather than the datepicker's [max]:
// on a range input [max] would stop the end too, and a trip you're on now can end in the future.
const notFuture = (control: AbstractControl<Date | null>): ValidationErrors | null =>
  control.value && isFuture(control.value) ? { future: true } : null;

// The phone's Add trip as one docked form; the two offer the same choices. Country and city come from the
// countries dataset, so the coordinates and ISO code the API needs are always right. A typed name that isn't a
// listed city (or any name, in a country with no city list) can be added as a new place, pinned at the
// country's centre point.
@Component({
  selector: 'app-add-trip-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    FlagComponent,
  ],
  providers: [provideDayFirstDates()],
  templateUrl: './add-trip-dialog-component.html',
  styleUrl: './add-trip-dialog-component.css',
})
export class AddTripDialogComponent {
  private dialogRef = inject<MatDialogRef<AddTripDialogComponent, TripResponse>>(MatDialogRef);
  private places = inject(PlacesService);
  private trips = inject(TripService);
  private fb = inject(FormBuilder).nonNullable;
  private mapFocus = inject(MapFocusService);
  private destroyRef = inject(DestroyRef);
  private readonly visited = inject<AddTripDialogData>(MAT_DIALOG_DATA).visited;

  protected readonly maxNotes = MAX_NOTES;

  protected readonly form = this.fb.group({
    country: this.fb.control<CountryOption | string>('', { validators: picked }),
    // A place, not a CityOption: a listed city and a typed new place are picked the same way
    city: this.fb.control<PickedPlace | string>('', { validators: picked }),
    dates: this.fb.group({
      start: this.fb.control<Date | null>(null, {
        validators: [Validators.required, notFuture],
      }),
      // Empty for a day trip
      end: this.fb.control<Date | null>(null),
    }),
    notes: this.fb.control('', { validators: Validators.maxLength(MAX_NOTES) }),
  });

  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  private readonly allCountries = toSignal(
    this.places.getCountries().pipe(catchError(() => of(null))),
  );
  protected readonly countriesLoading = computed(() => this.allCountries() === undefined);
  protected readonly countriesFailed = computed(() => this.allCountries() === null);

  private readonly countryValue = toSignal(this.form.controls.country.valueChanges, {
    initialValue: this.form.controls.country.value,
  });
  private readonly cityValue = toSignal(this.form.controls.city.valueChanges, {
    initialValue: this.form.controls.city.value,
  });

  protected readonly selectedCountry = computed(() => {
    const value = this.countryValue();
    return isPicked(value) ? value : null;
  });
  /** The place the form would save right now: a listed city or a new place, once picked */
  protected readonly selectedPlace = computed(() => {
    const value = this.cityValue();
    return isPicked(value) ? value : null;
  });

  protected readonly countryOptions = computed(() =>
    filterByName(this.allCountries() ?? [], this.countryValue()),
  );
  /** "Been before", above all the countries, until something is typed (then it's just results) */
  protected readonly visitedOptions = computed(() => {
    const value = this.countryValue();
    if (typeof value !== 'string' || value.trim()) return [];
    const byCode = new Map((this.allCountries() ?? []).map((c) => [c.isoCode, c]));
    return this.visited.flatMap((v) => {
      const country = byCode.get(v.isoCode);
      return country ? [{ country, summary: v.summary }] : [];
    });
  });

  protected readonly retryCities$ = new Subject<void>();

  // Cities load when a country is picked (one request per country, cached in PlacesService), and again on
  // Retry; a failed request isn't cached, so subscribing again makes a new one
  protected readonly citiesState = toSignal(
    this.form.controls.country.valueChanges.pipe(
      map((value) => (isPicked(value) ? value.isoCode : null)),
      distinctUntilChanged(),
      switchMap((isoCode) =>
        isoCode
          ? this.retryCities$.pipe(
              startWith(undefined),
              switchMap(() =>
                this.places.getCities(isoCode).pipe(
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
  /** The picked country has no cities in the dataset, so every place is a typed one */
  protected readonly noCityList = computed(() => {
    const state = this.citiesState();
    return state.status === 'ready' && !state.cities.length;
  });
  private readonly cityText = computed(() => {
    const value = this.cityValue();
    return typeof value === 'string' ? value : value.cityName;
  });

  /** Matching cities as places, with the trips already made to each */
  protected readonly cityOptions = computed(() => {
    const country = this.selectedCountry();
    if (!country) return [];
    const trips = this.visited.find((v) => v.isoCode === country.isoCode)?.cityTrips ?? new Map();
    return filterByName(this.allCities(), this.cityText(), MAX_CITY_OPTIONS).map((city) => ({
      id: city.id,
      place: placeFromCity(country, city),
      trips: trips.get(cityKey(city.name, city.stateName)) ?? 0,
    }));
  });

  /** The typed text as a new place, offered after the listed cities (see newPlaceFor) */
  protected readonly newPlace = computed(() => {
    const country = this.selectedCountry();
    const value = this.cityValue();
    if (!country || typeof value !== 'string' || this.citiesState().status !== 'ready') return null;
    return newPlaceFor(country, this.allCities(), value);
  });

  private readonly countryInput = viewChild.required<ElementRef<HTMLInputElement>>('countryInput');

  constructor() {
    const { country, city } = this.form.controls;

    // Into the country field once the globe has slid aside, unless the user is already in a field by then
    afterNextRender(() => {
      const timer = setTimeout(() => {
        const active = document.activeElement;
        const unclaimed =
          !active || active === document.body || active.matches('mat-dialog-container');
        if (unclaimed) this.countryInput().nativeElement.focus();
      }, COUNTRY_FOCUS_DELAY_MS);
      this.destroyRef.onDestroy(() => clearTimeout(timer));
    });
    city.disable();

    // A new country invalidates the city; the city field only opens once a country is picked
    country.valueChanges
      .pipe(
        map((value) => (isPicked(value) ? value.isoCode : null)),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((isoCode) => {
        city.reset('');
        if (isoCode) {
          city.enable();
        } else {
          city.disable();
        }
      });

    // No closing while saving: the POST would still finish, but nobody would be left to refresh the list
    effect(() => {
      this.dialogRef.disableClose = this.saving();
    });

    // Turn the globe behind the dialog to what was picked: the country, then closer in on the city.
    // An effect, not a computed: moving the camera is a side effect outside this component.
    effect(() => {
      const place = this.selectedPlace();
      const pickedCountry = this.selectedCountry();
      if (place) {
        this.flyTo(place.latitude, place.longitude, CITY_ALTITUDE);
      } else if (pickedCountry) {
        this.flyTo(pickedCountry.latitude, pickedCountry.longitude, COUNTRY_ALTITUDE);
      }
    });

    // Highlight the place on the globe until it's saved (then it's a real marker) or dropped, as on a phone
    effect(() => {
      const place = this.selectedPlace();
      this.mapFocus.showPin(
        place
          ? {
              lat: place.latitude,
              lng: place.longitude,
              label: `${place.cityName}, ${place.countryName}`,
            }
          : null,
      );
    });
    this.destroyRef.onDestroy(() => this.mapFocus.showPin(null));
  }

  private flyTo(lat: number, lng: number, altitude: number): void {
    // A few dataset entries have no centre point; leave the globe where it is for those
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      this.mapFocus.focus({ lat, lng, altitude });
    }
  }

  protected displayName(option: CountryOption | PickedPlace | string | null): string {
    if (!option || typeof option === 'string') return option ?? '';
    return 'cityName' in option ? option.cityName : option.name;
  }

  protected save(): void {
    const { city, dates, notes } = this.form.getRawValue();
    const place = this.form.valid && isPicked(city) ? city : null;
    if (!place || !dates.start) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    this.trips.addTrip(buildTripRequest(place, dates.start, dates.end, notes)).subscribe({
      next: (created) => this.dialogRef.close(created),
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.showServerError(error);
      },
    });
  }

  // Server errors go next to the field they're about; anything else goes above the buttons
  private showServerError(error: HttpErrorResponse): void {
    const message = (error.error as ErrorResponse | null)?.message ?? '';
    const fields =
      error.status === 400 ? serverFieldErrors(message) : new Map<ServerField, string>();
    if (fields.size) {
      for (const [field, text] of fields) this.control(field).setErrors({ server: text });
      this.form.markAllAsTouched();
      return;
    }
    this.formError.set(saveFailedMessage(error.status));
  }

  private control(field: ServerField): AbstractControl {
    const { dates, ...controls } = this.form.controls;
    return field === 'start' || field === 'end' ? dates.controls[field] : controls[field];
  }
}
