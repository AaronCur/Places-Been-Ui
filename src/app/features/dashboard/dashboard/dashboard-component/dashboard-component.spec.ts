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

// Stands in for the WebGL globe and records what the dashboard passes it
@Component({ selector: 'app-globe', template: '' })
class FakeGlobe {
  readonly shapes = input.required<CountryShape[]>();
  readonly visitedCodes = input.required<ReadonlySet<string>>();
  readonly markers = input.required<GlobeMarker[]>();
  readonly focus = input<MapFocus | null>(null);
  readonly insetRight = input(0);
  readonly countryClick = output<string>();
}

const italy: CountryResponse = {
  id: 2,
  name: 'Italy',
  isoCode: 'IT',
  flag: '🇮🇹',
  cities: [{ id: 20, name: 'Rome', latitude: 41.9, longitude: 12.5 }],
};

describe('DashboardComponent', () => {
  let countries$: () => Observable<CountryResponse[]>;
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
    desktop = true;
  });

  const clickAdd = async (fixture: Awaited<ReturnType<typeof render>>) => {
    (fixture.nativeElement.querySelector('button.add') as HTMLElement).click();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalled()); // after the lazy import
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

  it('on a phone, opens the add dialog full screen and leaves the globe alone', async () => {
    desktop = false;
    const fixture = await render();

    await clickAdd(fixture);

    expect(dialog.open.mock.calls[0][1]).toMatchObject({ panelClass: 'pb-responsive-dialog' });
    expect(globe(fixture).insetRight()).toBe(0);
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

  it('invites adding a first city when nothing is visited yet', async () => {
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
      countryCode: 'IT',
      latitude: 41.9,
      longitude: 12.5,
    });
  });
});
