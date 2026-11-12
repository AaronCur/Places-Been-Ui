import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  computed,
  effect,
  inject,
  signal,
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
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
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
  MAX_CITY_NAME,
  MAX_NOTES,
  NO_PIN_MESSAGE,
  PickedPlace,
  ServerField,
  buildTripRequest,
  filterByName,
  isFuture,
  placeAtCentre,
  placeFromCity,
  saveFailedMessage,
  serverFieldErrors,
} from '../add-trip-shared/trip-form';
import { DOCKED_DIALOG_MARGIN, DOCKED_DIALOG_WIDTH } from './docked-dialog';

// All ~250 countries render fine; a country can have thousands of cities, so those are capped while typing
const MAX_CITY_OPTIONS = 50;
// Camera heights (globe radii) for the fly-to: close enough to see the country, then the city
const COUNTRY_ALTITUDE = 1.4;
const CITY_ALTITUDE = 0.6;

/**
 * Opens the dialog; emits the created trip, or undefined if cancelled. It lives in this (lazy) file so that
 * MatDialog itself, not just the component, stays out of the initial bundle: callers import() this file and
 * pass their injector instead of injecting MatDialog.
 *
 * It docks at the bottom right, just above the Add trip button, with a light backdrop, so the globe stays in
 * view and can be seen turning to the picked country. (Phones get add-trip-phone instead.)
 */
export function openAddTripDialog(injector: Injector): Observable<TripResponse | undefined> {
  return injector
    .get(MatDialog)
    .open<AddTripDialogComponent, void, TripResponse>(AddTripDialogComponent, {
      width: `${DOCKED_DIALOG_WIDTH}px`,
      position: { right: `${DOCKED_DIALOG_MARGIN}px`, bottom: '96px' },
      backdropClass: 'pb-light-backdrop',
      autoFocus: 'first-tabbable',
    })
    .afterClosed();
}

type CitiesState =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; cities: CityOption[] };

// Picked options are objects; while the user is still typing, the control holds the text
const isPicked = <T extends object>(value: T | string): value is T => typeof value === 'object';
const picked = (control: AbstractControl): ValidationErrors | null =>
  isPicked(control.value) ? null : { notPicked: true };
// Free-text city: some text that isn't only spaces
const named = (control: AbstractControl): ValidationErrors | null =>
  typeof control.value === 'string' && control.value.trim() ? null : { required: true };

// A trip can't start after today (the API's @PastOrPresent). A validator rather than the datepicker's [max]:
// on a range input [max] would stop the end too, and a trip you're on now can end in the future.
const notFuture = (control: AbstractControl<Date | null>): ValidationErrors | null =>
  control.value && isFuture(control.value) ? { future: true } : null;

// Country and city come from the countries dataset, so the coordinates and ISO code the API needs are always
// right. For the few countries with no cities in the dataset (Macau, Gibraltar…) the city is typed instead and
// the pin goes at the country's centre point.
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

  protected readonly maxNotes = MAX_NOTES;

  protected readonly form = this.fb.group({
    country: this.fb.control<CountryOption | string>('', { validators: picked }),
    city: this.fb.control<CityOption | string>('', { validators: picked }),
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
  private readonly selectedCity = computed(() => {
    const value = this.cityValue();
    return isPicked(value) ? value : null;
  });

  protected readonly countryOptions = computed(() =>
    filterByName(this.allCountries() ?? [], this.countryValue()),
  );

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

  /** The picked country has no cities in the dataset, so the city is typed rather than picked */
  protected readonly freeTextCity = computed(() => {
    const state = this.citiesState();
    return state.status === 'ready' && !state.cities.length;
  });

  protected readonly cityOptions = computed(() => {
    const state = this.citiesState();
    return state.status === 'ready'
      ? filterByName(state.cities, this.cityValue(), MAX_CITY_OPTIONS)
      : [];
  });

  /** The place the form would save right now: a picked city, or a typed one at its country's centre */
  private readonly pinnedPlace = computed(() => {
    const country = this.selectedCountry();
    const city = this.cityValue();
    if (!country) return null;
    if (isPicked(city)) return placeFromCity(country, city);
    return this.freeTextCity() && typeof city === 'string' ? placeAtCentre(country, city) : null;
  });

  constructor() {
    const { country, city } = this.form.controls;
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

    // The city's rule follows the dataset: picked from the list, or typed when the country has no list
    effect(() => {
      city.setValidators(
        this.freeTextCity() ? [named, Validators.maxLength(MAX_CITY_NAME)] : picked,
      );
      city.updateValueAndValidity({ emitEvent: false });
    });

    // No closing while saving: the POST would still finish, but nobody would be left to refresh the list
    effect(() => {
      this.dialogRef.disableClose = this.saving();
    });

    // Turn the globe behind the dialog to what was picked: the country, then closer in on the city.
    // An effect, not a computed: moving the camera is a side effect outside this component.
    effect(() => {
      const pickedCity = this.selectedCity();
      const pickedCountry = this.selectedCountry();
      if (pickedCity) {
        this.flyTo(pickedCity.latitude, pickedCity.longitude, CITY_ALTITUDE);
      } else if (pickedCountry) {
        this.flyTo(pickedCountry.latitude, pickedCountry.longitude, COUNTRY_ALTITUDE);
      }
    });

    // Highlight the place on the globe until it's saved (then it's a real marker) or dropped, as on a phone
    effect(() => {
      const place = this.pinnedPlace();
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
    inject(DestroyRef).onDestroy(() => this.mapFocus.showPin(null));
  }

  private flyTo(lat: number, lng: number, altitude: number): void {
    // A few dataset entries have no centre point; leave the globe where it is for those
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      this.mapFocus.focus({ lat, lng, altitude });
    }
  }

  protected displayName(option: { name: string } | string | null): string {
    return typeof option === 'string' ? option : (option?.name ?? '');
  }

  protected save(): void {
    const { country, dates, notes } = this.form.getRawValue();
    // Validators first: placeOf flags a country with no centre point, which shouldn't hide a missing name
    const valid = this.form.valid && isPicked(country) && !!dates.start;
    const place = valid && isPicked(country) ? this.placeOf(country) : null;
    if (!place || !isPicked(country) || !dates.start) {
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

  // The city part of the request: the picked city, or the typed name at the country's centre point
  private placeOf(country: CountryOption): PickedPlace | null {
    const city = this.form.controls.city.value;
    if (isPicked(city)) return placeFromCity(country, city);
    if (!this.freeTextCity()) return null;
    const place = placeAtCentre(country, city);
    // Only a missing centre point gets here: the validators have already checked the name
    if (!place) this.form.controls.city.setErrors({ server: NO_PIN_MESSAGE });
    return place;
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
