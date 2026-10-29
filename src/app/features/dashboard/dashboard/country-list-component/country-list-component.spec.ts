import { TestBed } from '@angular/core/testing';
import { CountryResponse } from '../../../../core/models/travel.model';
import { CityDeleteRequest, CountryListComponent } from './country-list-component';

const france: CountryResponse = {
  id: 1,
  name: 'France',
  isoCode: 'FR',
  flag: '🇫🇷',
  cities: [{ id: 10, name: 'Lyon', latitude: 45.76, longitude: 4.83 }],
};
const italy: CountryResponse = {
  id: 2,
  name: 'Italy',
  isoCode: 'IT',
  flag: '🇮🇹',
  cities: [
    { id: 20, name: 'Rome', latitude: 41.9, longitude: 12.5 },
    { id: 21, name: 'Florence', latitude: 43.77, longitude: 11.25 },
  ],
};

describe('CountryListComponent', () => {
  async function render(selected: string | null = null) {
    const fixture = TestBed.createComponent(CountryListComponent);
    fixture.componentRef.setInput('countries', [france, italy]);
    fixture.componentRef.setInput('selected', selected);
    await fixture.whenStable();
    return fixture;
  }

  it('lists each country with its flag and city count', async () => {
    const fixture = await render();
    const headers = [...fixture.nativeElement.querySelectorAll('mat-expansion-panel-header')].map(
      (h: Element) => [
        h.querySelector('app-flag img')!.getAttribute('src'),
        h.querySelector('.name')!.textContent!.trim(),
        h.querySelector('mat-panel-description')!.textContent!.trim(),
      ],
    );

    expect(headers).toEqual([
      ['flags/fr.svg', 'France', '1 city'],
      ['flags/it.svg', 'Italy', '2 cities'],
    ]);
  });

  it('opens the selected country, e.g. one clicked on the globe', async () => {
    const fixture = await render('IT');
    const panels = fixture.nativeElement.querySelectorAll('mat-expansion-panel');

    expect(panels[0].classList).not.toContain('mat-expanded');
    expect(panels[1].classList).toContain('mat-expanded');
  });

  it('updates the selection when a panel is opened or closed', async () => {
    const fixture = await render();
    const header = () => fixture.nativeElement.querySelectorAll('mat-expansion-panel-header')[0];

    header().click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBe('FR');

    header().click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBeNull();
  });

  it('asks to delete a city, with its country', async () => {
    const fixture = await render('IT');
    const requests: CityDeleteRequest[] = [];
    fixture.componentInstance.deleteCity.subscribe((r) => requests.push(r));

    (fixture.nativeElement.querySelector('[aria-label="Delete Florence"]') as HTMLElement).click();

    expect(requests).toEqual([{ city: italy.cities![1], country: italy }]);
  });
});
