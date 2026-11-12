import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { EMPTY, Observable, Subject, of, throwError } from 'rxjs';
import { DashboardComponent } from './dashboard-component';
import { TravelService } from '../../../../core/services/travel.service';
import { CountryShape, WorldService } from '../../../../core/services/world.service';
import { GlobeComponent, GlobeMarker } from '../../../../shared/components/globe/globe.component';
import { CityRequest, CountryResponse } from '../../../../core/models/travel.model';
import { MapFocus, MapFocusService } from '../../../../core/services/map-focus.service';
import { TripResponse } from '../../../../core/models/trip.model';
import { TripService } from '../../../../core/services/trip.service';

// Stands in for the WebGL globe and records what the dashboard passes it
@Component({ selector: 'app-globe', template: '' })
class FakeGlobe {
  readonly shapes = input.required<CountryShape[]>();
  readonly visitedCodes = input.required<ReadonlySet<string>>();
  readonly markers = input.required<GlobeMarker[]>();
  readonly focus = input<MapFocus | null>(null);
  readonly insetRight = input(0);
  readonly fill = input<number | null>(null);
  readonly countryClick = output<string>();
}

const italy: CountryResponse = {
  id: 2,
  name: 'Italy',
  isoCode: 'IT',
  flag: '🇮🇹',
  cities: [{ id: 20, name: 'Rome', latitude: 41.9, longitude: 12.5 }],
};

const romeTrip = (id: number): TripResponse => ({
  id,
  startDate: '2025-05-01',
  city: { id: 20, name: 'Rome', latitude: 41.9, longitude: 12.5 },
  country: { isoCode: 'IT', name: 'Italy', flag: '🇮🇹' },
});

describe('DashboardComponent', () => {
  let countries$: () => Observable<CountryResponse[]>;
  let trips$: () => Observable<TripResponse[]>;
  let travel: {
    getStatsSummary: () => Observable<unknown>;
    getCountries: () => Observable<CountryResponse[]>;
    deleteCity: ReturnType<typeof vi.fn>;
    addCity: ReturnType<typeof vi.fn>;
  };
  let undo: Subject<void>;
  let snackBar: { open: ReturnType<typeof vi.fn> };
  let dialogClosed: Subject<unknown>;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let desktop: boolean;

  async function render() {
    undo = new Subject<void>();
    dialogClosed = new Subject<unknown>();
    dialog = { open: vi.fn(() => ({ afterClosed: () => dialogClosed })) };
    snackBar = { open: vi.fn(() => ({ onAction: () => undo })) };
    travel = {
      getStatsSummary: () => of({ totalCountries: 1, totalCities: 1 }),
      getCountries: () => countries$(),
      deleteCity: vi.fn(() => of(undefined)),
      addCity: vi.fn((r: CityRequest) => of({ id: 99, ...r })),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: TravelService, useValue: travel },
        { provide: TripService, useValue: { getTrips: () => trips$() } },
        { provide: WorldService, useValue: { getShapes: () => EMPTY } },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: MatDialog, useValue: dialog },
        {
          provide: BreakpointObserver,
          useValue: { observe: () => of({ matches: desktop, breakpoints: {} }) },
        },
      ],
    }).overrideComponent(DashboardComponent, {
      remove: { imports: [GlobeComponent] },
      add: { imports: [FakeGlobe] },
    });
    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    return fixture;
  }

  const globe = (fixture: Awaited<ReturnType<typeof render>>) =>
    fixture.debugElement.children
      .flatMap((c) => c.children)
      .find((c) => c.componentInstance instanceof FakeGlobe)!.componentInstance as FakeGlobe;

  beforeEach(() => {
    countries$ = () => of([italy]);
    trips$ = () => of([]); // cities added before trips existed have none
    desktop = true;
  });

  const clickAdd = async (fixture: Awaited<ReturnType<typeof render>>) => {
    (fixture.nativeElement.querySelector('button.add, button.add-round') as HTMLElement).click();
    // After the lazy import, which can be slow while the rest of the suite runs in parallel
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalled(), { timeout: 5000 });
    await fixture.whenStable();
  };

  it('on desktop, docks the add dialog and re-centres the globe beside it until it closes', async () => {
    const fixture = await render();

    await clickAdd(fixture);

    expect(dialog.open.mock.calls[0][1]).toMatchObject({ position: { right: '24px' } });
    expect(globe(fixture).insetRight()).toBe(488);

    dialogClosed.next(undefined);
    dialogClosed.complete();
    await fixture.whenStable();
    expect(globe(fixture).insetRight()).toBe(0);
  });

  it('on a phone, opens the full-screen Add trip with the places been, and leaves the globe alone', async () => {
    desktop = false;
    trips$ = () => of([romeTrip(1)]);
    const fixture = await render();

    await clickAdd(fixture);

    expect(dialog.open.mock.calls[0][1]).toMatchObject({
      panelClass: 'pb-phone-add-trip',
      disableClose: true,
      data: { visited: [expect.objectContaining({ isoCode: 'IT', summary: '1 city · 1 trip' })] },
    });
    expect(globe(fixture).insetRight()).toBe(0);
  });

  it('on a phone, collapses an expanded sheet when Add trip opens', async () => {
    desktop = false;
    const fixture = await render();
    const handle = () =>
      (fixture.nativeElement as HTMLElement).querySelector('app-drag-sheet .handle') as HTMLElement;

    handle().click();
    await fixture.whenStable();
    expect(handle().getAttribute('aria-expanded')).toBe('true');

    await clickAdd(fixture);

    expect(handle().getAttribute('aria-expanded')).toBe('false');
  });

  it('shows a place picked but not saved yet as a highlighted pin', async () => {
    const fixture = await render();
    const focus = TestBed.inject(MapFocusService);

    focus.showPin({ lat: 48.9, lng: 2.35, label: 'Paris, France' });
    await fixture.whenStable();
    expect(globe(fixture).markers().at(-1)).toEqual({
      lat: 48.9,
      lng: 2.35,
      label: 'Paris, France',
      highlight: true,
    });

    focus.showPin(null);
    await fixture.whenStable();
    expect(
      globe(fixture)
        .markers()
        .some((m) => m.highlight),
    ).toBe(false);
  });

  it('on desktop, shows the stats and list in the side panel', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('section.panel app-stats-cards')).not.toBeNull();
    expect(el.querySelector('section.panel app-country-list')).not.toBeNull();
    expect(el.querySelector('app-drag-sheet')).toBeNull();
    // The extended Add trip button over the globe, and the globe at its desktop zoom
    expect(el.querySelector('button.add')?.textContent).toContain('Add trip');
    expect(el.querySelector('button.add-round')).toBeNull();
    expect(globe(fixture).fill()).toBeNull();
  });

  it('on a phone, shows them in a drag sheet over the globe, collapsed to start with', async () => {
    desktop = false;
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('app-drag-sheet app-stats-cards')).not.toBeNull();
    expect(el.querySelector('app-drag-sheet app-country-list')).not.toBeNull();
    expect(el.querySelector('section.panel')).toBeNull();
    expect(el.querySelector('app-drag-sheet .handle')?.getAttribute('aria-expanded')).toBe('false');
    // The title stays outside the sheet (hidden visually, but there for screen readers)
    expect(el.querySelector('app-drag-sheet h1')).toBeNull();
    expect(el.querySelector('h1')?.textContent).toBe('Places Been');
    // Add trip is a round button in the top bar, not a floating one over the list
    expect(el.querySelector('header button.add-round')?.getAttribute('aria-label')).toBe(
      'Add trip',
    );
    expect(el.querySelector('button.add')).toBeNull();
    // A near-full-width globe
    expect(globe(fixture).fill()).toBe(0.9);
  });

  it('passes the number of trips to the stats', async () => {
    trips$ = () => of([romeTrip(1), romeTrip(2)]);
    const fixture = await render();

    const counts = [...fixture.nativeElement.querySelectorAll('app-stats-cards .count .value')];
    expect(counts.map((c) => (c as HTMLElement).textContent?.trim())).toEqual(['1', '1', '2']);
  });

  it('after a trip is added, says so, refreshes and opens its country', async () => {
    const fixture = await render();
    trips$ = () => of([romeTrip(1)]);

    await clickAdd(fixture);
    dialogClosed.next(romeTrip(1));
    dialogClosed.complete();
    await fixture.whenStable();

    expect(snackBar.open).toHaveBeenCalledWith('Rome trip added', undefined, { duration: 3000 });
    expect(fixture.nativeElement.querySelector('mat-expansion-panel').classList).toContain(
      'mat-expanded',
    );
    // The reload picked up the new trip
    expect(globe(fixture).markers()).toEqual([
      { lat: 41.9, lng: 12.5, label: 'Rome, Italy · 1 trip' },
    ]);
  });

  it('does nothing more when the add dialog is cancelled', async () => {
    const fixture = await render();
    trips$ = vi.fn(() => of([]));

    await clickAdd(fixture);
    dialogClosed.next(undefined);
    dialogClosed.complete();
    await fixture.whenStable();

    expect(snackBar.open).not.toHaveBeenCalled();
    expect(trips$).not.toHaveBeenCalled();
  });

  it('shows the stats and the visited countries', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('app-stats-cards .value')?.textContent?.trim()).toBe('1');
    expect(el.querySelector('app-country-list .name')?.textContent?.trim()).toBe('Italy');
  });

  it('feeds the globe the visited codes and a marker per city', async () => {
    const fixture = await render();

    expect([...globe(fixture).visitedCodes()]).toEqual(['IT']);
    expect(globe(fixture).markers()).toEqual([{ lat: 41.9, lng: 12.5, label: 'Rome, Italy' }]);
  });

  it('counts each city’s trips in the list and on its globe marker', async () => {
    trips$ = () => of([romeTrip(2), romeTrip(1)]);
    const fixture = await render();

    expect(globe(fixture).markers()).toEqual([
      { lat: 41.9, lng: 12.5, label: 'Rome, Italy · 2 trips' },
    ]);
    expect(
      fixture.nativeElement.querySelector('mat-panel-description').textContent.replace(/\s+/g, ' '),
    ).toContain('1 city · 2 trips');
  });

  it('shows the load error when only the trips fail to load', async () => {
    trips$ = () => throwError(() => new Error('down'));
    const fixture = await render();

    expect(fixture.nativeElement.textContent).toContain('Couldn’t load your places');
  });

  it('passes focus requests (e.g. from the add dialog) on to the globe', async () => {
    const fixture = await render();
    expect(globe(fixture).focus()).toBeNull();

    TestBed.inject(MapFocusService).focus({ lat: 41.9, lng: 12.5, altitude: 0.6 });
    await fixture.whenStable();

    expect(globe(fixture).focus()).toEqual({ lat: 41.9, lng: 12.5, altitude: 0.6 });
  });

  it('opens the clicked country in the list', async () => {
    const fixture = await render();

    globe(fixture).countryClick.emit('IT');
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('mat-expansion-panel').classList).toContain(
      'mat-expanded',
    );
    // It's already in view on the globe, so the camera stays put
    expect(TestBed.inject(MapFocusService).target()).toBeNull();
  });

  it('turns the globe to a country opened in the list', async () => {
    const fixture = await render();

    (fixture.nativeElement.querySelector('mat-expansion-panel-header') as HTMLElement).click();
    await fixture.whenStable();

    // No shapes in this test, so it aims at the visited city (Rome) from country height
    expect(TestBed.inject(MapFocusService).target()).toEqual({
      lat: 41.9,
      lng: 12.5,
      altitude: 0.7,
    });
  });

  it('invites adding a first trip when nothing is visited yet', async () => {
    countries$ = () => of([]);
    const fixture = await render();

    expect(fixture.nativeElement.textContent).toContain('Nothing scratched off yet');
  });

  it('offers a retry when loading fails', async () => {
    countries$ = () => throwError(() => new Error('down'));
    const fixture = await render();
    expect(fixture.nativeElement.textContent).toContain('Couldn’t load your places');

    countries$ = () => of([italy]);
    (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLElement).click();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Italy');
  });

  it('deletes a city straight away and puts it back on Undo', async () => {
    const fixture = await render();
    (fixture.nativeElement.querySelector('mat-expansion-panel-header') as HTMLElement).click();
    await fixture.whenStable();

    (fixture.nativeElement.querySelector('[aria-label="Delete Rome"]') as HTMLElement).click();

    expect(travel.deleteCity).toHaveBeenCalledWith(20);
    expect(snackBar.open).toHaveBeenCalledWith('Rome deleted', 'Undo', { duration: 6000 });
    expect(travel.addCity).not.toHaveBeenCalled();

    undo.next();

    expect(travel.addCity).toHaveBeenCalledWith({
      name: 'Rome',
      state: null,
      countryCode: 'IT',
      latitude: 41.9,
      longitude: 12.5,
    });
  });

  describe('with two cities of the same name', () => {
    beforeEach(() => {
      countries$ = () =>
        of([
          {
            id: 3,
            name: 'United States',
            isoCode: 'US',
            flag: '🇺🇸',
            cities: [
              { id: 30, name: 'Portland', state: 'Oregon', latitude: 45.52, longitude: -122.68 },
              { id: 31, name: 'Portland', state: 'Maine', latitude: 43.66, longitude: -70.26 },
            ],
          },
        ]);
    });

    it('names the state in the globe markers', async () => {
      const fixture = await render();

      expect(
        globe(fixture)
          .markers()
          .map((m) => m.label),
      ).toEqual(['Portland, Oregon, United States', 'Portland, Maine, United States']);
    });

    it('names the state when deleting and restores it on Undo', async () => {
      const fixture = await render();
      (fixture.nativeElement.querySelector('mat-expansion-panel-header') as HTMLElement).click();
      await fixture.whenStable();

      (
        fixture.nativeElement.querySelector('[aria-label="Delete Portland, Maine"]') as HTMLElement
      ).click();
      expect(snackBar.open).toHaveBeenCalledWith('Portland, Maine deleted', 'Undo', {
        duration: 6000,
      });

      undo.next();

      expect(travel.addCity).toHaveBeenCalledWith({
        name: 'Portland',
        state: 'Maine',
        countryCode: 'US',
        latitude: 43.66,
        longitude: -70.26,
      });
    });
  });

  const clickDeleteRome = async (fixture: Awaited<ReturnType<typeof render>>) => {
    (fixture.nativeElement.querySelector('mat-expansion-panel-header') as HTMLElement).click();
    await fixture.whenStable();
    (fixture.nativeElement.querySelector('[aria-label="Delete Rome"]') as HTMLElement).click();
    await fixture.whenStable();
  };

  it('keeps the list on screen while it refreshes', async () => {
    const fixture = await render();
    const refresh = new Subject<CountryResponse[]>();
    countries$ = () => refresh;

    await clickDeleteRome(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.title-row mat-progress-bar')).not.toBeNull();
    expect(el.querySelector('app-country-list .name')?.textContent?.trim()).toBe('Italy');

    refresh.next([]);
    refresh.complete();
    await fixture.whenStable();

    expect(el.querySelector('.title-row mat-progress-bar')).toBeNull();
    expect(el.textContent).toContain('Nothing scratched off yet');
  });

  it('keeps the list and offers a retry when a refresh fails', async () => {
    const fixture = await render();
    countries$ = () => throwError(() => new Error('down'));

    await clickDeleteRome(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Couldn’t load your places');
    expect(el.querySelector('app-country-list .name')?.textContent?.trim()).toBe('Italy');
  });

  it('ignores an older refresh that answers after a newer one', async () => {
    const fixture = await render();
    const requests: Subject<CountryResponse[]>[] = [];
    countries$ = () => {
      requests.push(new Subject());
      return requests.at(-1)!;
    };
    const answer = (request: Subject<CountryResponse[]>, countries: CountryResponse[]) => {
      request.next(countries);
      request.complete();
    };

    await clickDeleteRome(fixture); // refresh 1: Rome is gone
    undo.next(); // refresh 2: Rome is back
    answer(requests[1], [italy]);
    answer(requests[0], []);
    await fixture.whenStable();

    expect(requests).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('app-country-list .name')?.textContent).toContain(
      'Italy',
    );
  });

  it('opens one dialog however often the button is clicked while it loads', async () => {
    const fixture = await render();
    const button = fixture.nativeElement.querySelector(
      'button.add, button.add-round',
    ) as HTMLElement;

    button.click();
    button.click();
    await clickAdd(fixture);

    expect(dialog.open).toHaveBeenCalledTimes(1);
  });

  it('says so when the dialog cannot open, and lets the user try again', async () => {
    const fixture = await render();
    dialog.open.mockImplementationOnce(() => {
      throw new Error('chunk failed');
    });

    await clickAdd(fixture);
    await vi.waitFor(() =>
      expect(snackBar.open).toHaveBeenCalledWith(
        'Couldn’t open the form. Check your connection and try again.',
        'OK',
        { duration: 6000 },
      ),
    );

    await clickAdd(fixture);
    expect(dialog.open).toHaveBeenCalledTimes(2);
    expect(globe(fixture).insetRight()).toBe(488);
  });
});
