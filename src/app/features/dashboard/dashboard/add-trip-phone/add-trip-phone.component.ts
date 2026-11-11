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
  untracked,
  viewChild,
} from '@angular/core';
import { PlatformLocation, formatDate } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Observable, filter } from 'rxjs';
import { ErrorResponse } from '../../../../core/models/travel.model';
import { TripResponse } from '../../../../core/models/trip.model';
import { MapFocusService } from '../../../../core/services/map-focus.service';
import { TripService } from '../../../../core/services/trip.service';
import { FlagComponent } from '../../../../shared/components/flag/flag.component';
import {
  MAX_NOTES,
  PickedPlace,
  buildTripRequest,
  saveFailedMessage,
  serverFieldErrors,
} from '../add-trip-shared/trip-form';
import { DatesPickerComponent, TripDates } from './dates-picker/dates-picker.component';
import { PickerStep, PlacePickerComponent } from './place-picker/place-picker.component';
import { VisitedCountry } from './visited';

export interface AddTripPhoneData {
  /** The places already visited, for the picker's "Been before" */
  visited: VisitedCountry[];
}

type Screen = 'summary' | 'where' | 'when' | 'notes';
type Row = 'where' | 'when' | 'notes';

const CITY_ALTITUDE = 0.6;

/**
 * Opens the phone's Add trip; emits the created trip, or undefined if closed. Like the desktop dialog it lives
 * in a lazy file and takes the caller's injector, so MatDialog stays out of the initial bundle.
 *
 * Full screen, with a see-through top on the summary so the dashboard's globe shows above the panel and can
 * be seen flying to the picked place. Closing is handled here (disableClose): a tap on the globe shouldn't
 * throw the trip away, and the phone's back gesture steps back through the screens instead of closing.
 */
export function openAddTripPhoneDialog(
  injector: Injector,
  data: AddTripPhoneData,
): Observable<TripResponse | undefined> {
  return injector
    .get(MatDialog)
    .open<AddTripPhoneComponent, AddTripPhoneData, TripResponse>(AddTripPhoneComponent, {
      data,
      width: '100vw',
      maxWidth: '100vw',
      height: '100dvh',
      maxHeight: '100dvh',
      panelClass: 'pb-phone-add-trip',
      backdropClass: 'pb-clear-backdrop',
      disableClose: true,
      closeOnNavigation: false,
      autoFocus: 'dialog',
    })
    .afterClosed();
}

/** "12–15 Oct 2026", "29 Oct – 2 Nov 2026", "30 Dec 2025 – 2 Jan 2026" or "3 Nov 2026 · day trip" */
export function describeDates({ start, end }: TripDates): string {
  const format = (date: Date, pattern: string) => formatDate(date, pattern, 'en-US');
  if (!end) return `${format(start, 'd MMM y')} · day trip`;
  if (start.getFullYear() !== end.getFullYear()) {
    return `${format(start, 'd MMM y')} – ${format(end, 'd MMM y')}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${format(start, 'd MMM')} – ${format(end, 'd MMM y')}`;
  }
  return `${format(start, 'd')}–${format(end, 'd MMM y')}`;
}

/**
 * Add trip on a phone (design: "Add trip on a phone"): a summary with three rows (Where, When, Notes), each
 * opening its own full-screen picker, and Save in the top bar where the keyboard never covers it.
 *
 * Each screen is a browser history entry, so the phone's back gesture steps back through them (cities →
 * countries → summary → closed) instead of leaving the app. Screens are left through history too (back(),
 * historyGo()), keeping it in step; the popstate handler is what actually changes the screen.
 */
@Component({
  selector: 'app-add-trip-phone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    FlagComponent,
    PlacePickerComponent,
    DatesPickerComponent,
  ],
  templateUrl: './add-trip-phone.component.html',
  styleUrl: './add-trip-phone.component.css',
})
export class AddTripPhoneComponent {
  private dialogRef = inject<MatDialogRef<AddTripPhoneComponent, TripResponse>>(MatDialogRef);
  private trips = inject(TripService);
  private mapFocus = inject(MapFocusService);
  private history = inject(PlatformLocation);
  private injector = inject(Injector);
  private readonly notesBox = viewChild<ElementRef<HTMLTextAreaElement>>('notesBox');
  protected readonly data = inject<AddTripPhoneData>(MAT_DIALOG_DATA);
  protected readonly maxNotes = MAX_NOTES;

  protected readonly screen = signal<Screen>('summary');
  protected readonly pickerStep = signal<PickerStep>('countries');

  protected readonly place = signal<PickedPlace | null>(null);
  protected readonly dates = signal<TripDates | null>(null);
  protected readonly notes = signal('');

  protected readonly saving = signal(false);
  protected readonly errors = signal<Partial<Record<Row, string>>>({});
  protected readonly formError = signal<string | null>(null);

  protected readonly ready = computed(() => !!this.place() && !!this.dates() && !this.saving());
  protected readonly datesText = computed(() => {
    const dates = this.dates();
    return dates ? describeDates(dates) : null;
  });
  protected readonly subline = computed(() =>
    !this.place()
      ? 'Pick a place and the dates to save the trip.'
      : (this.datesText() ?? 'Now, when was it?'),
  );

  /** History entries this dialog has added: 1 for the summary, 2 for a picker, 3 for a country's cities */
  private depth = 0;
  private closing = false;

  constructor() {
    const destroyRef = inject(DestroyRef);

    this.pushEntry();
    const stopListening = this.history.onPopState(() => this.onHistoryBack());
    destroyRef.onDestroy(() => {
      stopListening();
      this.mapFocus.showPin(null); // saved (now a real marker) or dropped
    });

    // The place picker's cities are a screen of their own for the back gesture; its own back arrow
    // (step back to countries) goes through history like every other back
    effect(() => {
      const step = this.pickerStep();
      untracked(() => {
        if (this.screen() !== 'where') return;
        if (step === 'cities' && this.depth === 2) this.pushEntry();
        if (step === 'countries' && this.depth === 3) this.back();
      });
    });

    this.dialogRef
      .keydownEvents()
      .pipe(
        filter((event) => event.key === 'Escape'),
        takeUntilDestroyed(),
      )
      .subscribe(() => (this.screen() === 'summary' ? this.close() : this.back()));
  }

  protected open(screen: Exclude<Screen, 'summary'>): void {
    if (this.saving()) return;
    if (screen === 'where') this.pickerStep.set('countries');
    this.screen.set(screen);
    this.pushEntry();
    // The searches focus themselves; the notes screen is just this text area, so the keyboard comes up
    if (screen === 'notes') {
      afterNextRender(() => this.notesBox()?.nativeElement.focus(), { injector: this.injector });
    }
  }

  /** One screen back, through history (the popstate handler moves the screen) */
  protected back(): void {
    this.history.back();
  }

  protected onPlace(place: PickedPlace): void {
    this.place.set(place);
    this.clearError('where');
    const label = `${place.cityName}, ${place.countryName}`;
    this.mapFocus.focus({ lat: place.latitude, lng: place.longitude, altitude: CITY_ALTITUDE });
    this.mapFocus.showPin({ lat: place.latitude, lng: place.longitude, label });
    this.toSummary();
  }

  protected onDates(dates: TripDates): void {
    this.dates.set(dates);
    this.clearError('when');
    this.toSummary();
  }

  protected setNotes(event: Event): void {
    this.notes.set((event.target as HTMLTextAreaElement).value);
    this.clearError('notes');
  }

  protected close(result?: TripResponse): void {
    if (this.saving() && !result) return;
    this.closing = true;
    // Leave history as it was before the dialog opened
    if (this.depth) this.go(-this.depth);
    this.dialogRef.close(result);
  }

  protected save(): void {
    const place = this.place();
    const dates = this.dates();
    if (!place || !dates || this.saving()) return;

    this.saving.set(true);
    this.errors.set({});
    this.formError.set(null);
    this.trips.addTrip(buildTripRequest(place, dates.start, dates.end, this.notes())).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.close(created);
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.showServerError(error);
      },
    });
  }

  // Back to the summary from a picker, however deep: one history jump
  private toSummary(): void {
    this.screen.set('summary');
    if (this.depth > 1) {
      const steps = this.depth - 1;
      this.depth = 1;
      this.go(-steps);
    }
  }

  // historyGo is optional on PlatformLocation; every browser has it
  private go(steps: number): void {
    this.history.historyGo?.(steps);
  }

  private pushEntry(): void {
    this.depth++;
    this.history.pushState({ pbAddTrip: this.depth }, '', this.history.href);
  }

  private onHistoryBack(): void {
    if (this.closing) return;
    const state = this.history.getState() as { pbAddTrip?: number } | null;
    const depth = state?.pbAddTrip ?? 0;
    this.depth = depth;

    if (depth === 0) {
      if (this.saving()) {
        this.pushEntry(); // a save is on its way: stay until it's done
      } else {
        this.close();
      }
    } else if (depth === 1) {
      this.screen.set('summary');
    } else if (depth === 2 && this.screen() === 'where') {
      this.pickerStep.set('countries');
    }
  }

  private clearError(row: Row): void {
    this.errors.update(({ [row]: _, ...rest }) => rest);
  }

  // Server errors go on the row they're about; anything else above the rows
  private showServerError(error: HttpErrorResponse): void {
    const message = (error.error as ErrorResponse | null)?.message ?? '';
    const fields = error.status === 400 ? serverFieldErrors(message) : new Map();
    if (!fields.size) {
      this.formError.set(saveFailedMessage(error.status));
      return;
    }
    const errors: Partial<Record<Row, string>> = {};
    for (const [field, text] of fields) {
      const row: Row =
        field === 'country' || field === 'city' ? 'where' : field === 'notes' ? 'notes' : 'when';
      errors[row] ??= text;
    }
    this.errors.set(errors);
  }
}
