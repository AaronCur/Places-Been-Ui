import {
  ChangeDetectionStrategy,
  Component,
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
} from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialog,
  MatDialogConfig,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Observable, catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { CityResponse, ErrorResponse } from '../../../../core/models/travel.model';
import { CityOption, CountryOption, PlacesService } from '../../../../core/services/places.service';
import { MapFocusService } from '../../../../core/services/map-focus.service';
import { TravelService } from '../../../../core/services/travel.service';
import { FlagComponent } from '../../../../shared/components/flag/flag.component';
import { DOCKED_DIALOG_MARGIN, DOCKED_DIALOG_WIDTH, DialogPlacement } from './docked-dialog';

// All ~250 countries render fine; a country can have thousands of cities, so those are capped while typing
const MAX_CITY_OPTIONS = 50;
// Camera heights (globe radii) for the fly-to: close enough to see the country, then the city
const COUNTRY_ALTITUDE = 1.4;
const CITY_ALTITUDE = 0.6;
/**
 * Opens the dialog; emits the created city, or undefined if cancelled. It lives in this (lazy) file so that
 * MatDialog itself, not just the component, stays out of the initial bundle: callers import() this file and
 * pass their injector instead of injecting MatDialog.
 *
 * On desktop it docks at the bottom right, just above the Add city button, with a light backdrop, so the
 * globe stays in view and can be seen turning to the picked country. `centered` is the phone layout, full
 * screen via the pb-responsive-dialog class.
 */
export function openAddCityDialog(
  injector: Injector,
  placement: DialogPlacement,
): Observable<CityResponse | undefined> {
  return injector
    .get(MatDialog)
    .open<AddCityDialogComponent, void, CityResponse>(AddCityDialogComponent, {
      ...PLACEMENTS[placement],
      autoFocus: 'first-tabbable',
    })
    .afterClosed();
}

const PLACEMENTS: Record<DialogPlacement, MatDialogConfig> = {
  centered: { width: '520px', maxWidth: '100vw', panelClass: 'pb-responsive-dialog' },
  docked: {
    width: `${DOCKED_DIALOG_WIDTH}px`,
    position: { right: `${DOCKED_DIALOG_MARGIN}px`, bottom: '96px' },
    backdropClass: 'pb-light-backdrop',
  },
};

type CitiesState =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; cities: CityOption[] };

// Picked options are objects; while the user is still typing, the control holds the text
const isPicked = <T extends object>(value: T | string): value is T => typeof value === 'object';
const picked = (control: AbstractControl): ValidationErrors | null =>
  isPicked(control.value) ? null : { notPicked: true };

// "Add trip" dialog from the design, minus Dates and Notes until the API has trips. Country and city come from
// the countries dataset, so the coordinates and ISO code the API needs are always right.
@Component({
  selector: 'app-add-city-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    FlagComponent,
  ],
  templateUrl: './add-city-dialog-component.html',
  styleUrl: './add-city-dialog-component.css',
})
export class AddCityDialogComponent {
  private dialogRef = inject<MatDialogRef<AddCityDialogComponent, CityResponse>>(MatDialogRef);
  private places = inject(PlacesService);
  private travel = inject(TravelService);
  private fb = inject(FormBuilder).nonNullable;
  private mapFocus = inject(MapFocusService);

  protected readonly form = this.fb.group({
    country: this.fb.control<CountryOption | string>('', { validators: picked }),
    city: this.fb.control<CityOption | string>('', { validators: picked }),
  });

  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  private readonly allCountries = toSignal(
    this.places.getCountries().pipe(catchError(() => of(null))),
  );
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

  // Cities load when a country is picked (one request per country, cached in PlacesService)
  protected readonly citiesState = toSignal(
    this.form.controls.country.valueChanges.pipe(
      map((value) => (isPicked(value) ? value.isoCode : null)),
      distinctUntilChanged(),
      switchMap((isoCode) =>
        isoCode
          ? this.places.getCities(isoCode).pipe(
              map((cities): CitiesState => ({ status: 'ready', cities })),
              startWith<CitiesState>({ status: 'loading' }),
              catchError(() => of<CitiesState>({ status: 'error' })),
            )
          : of<CitiesState>({ status: 'idle' }),
      ),
    ),
    { initialValue: { status: 'idle' } as CitiesState },
  );

  protected readonly cityOptions = computed(() => {
    const state = this.citiesState();
    return state.status === 'ready'
      ? filterByName(state.cities, this.cityValue(), MAX_CITY_OPTIONS)
      : [];
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
    const { country, city } = this.form.getRawValue();
    if (this.form.invalid || !isPicked(country) || !isPicked(city)) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    this.travel
      .addCity({
        name: city.name,
        countryCode: country.isoCode,
        latitude: city.latitude,
        longitude: city.longitude,
      })
      .subscribe({
        next: (created) => this.dialogRef.close(created),
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.showServerError(error);
        },
      });
  }

  // Server errors go next to the field they're about
  private showServerError(error: HttpErrorResponse): void {
    const message = (error.error as ErrorResponse | null)?.message;
    if (error.status === 409) {
      this.form.controls.city.setErrors({ server: 'You’ve already added this city' });
    } else if (error.status === 400 && message?.startsWith('Unknown country code')) {
      this.form.controls.country.setErrors({ server: 'This country isn’t supported yet' });
    } else {
      this.formError.set(
        error.status === 0
          ? 'Can’t reach the server. Check your connection and try again.'
          : 'Something went wrong while saving. Please try again.',
      );
    }
  }
}

/**
 * Options whose name, or any word in it, starts with the query ("korea" finds South Korea), names that start
 * with it first. `limit` keeps huge lists (a country's cities) from rendering thousands of options.
 */
export function filterByName<T extends { name: string }>(
  options: T[],
  query: T | string,
  limit = Infinity,
): T[] {
  const text = (typeof query === 'string' ? query : query.name).trim().toLocaleLowerCase();
  if (!text) return options.slice(0, limit);

  const starts: T[] = [];
  const wordStarts: T[] = [];
  for (const option of options) {
    const name = option.name.toLocaleLowerCase();
    if (name.startsWith(text)) {
      starts.push(option);
    } else if (name.split(/[\s\-'(]+/).some((word) => word.startsWith(text))) {
      wordStarts.push(option);
    }
  }
  return [...starts, ...wordStarts].slice(0, limit);
}
