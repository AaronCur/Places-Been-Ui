import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { I18nPluralPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { CityResponse, CountryResponse } from '../../../../core/models/travel.model';
import { cityLabels } from '../../../../core/models/city-label';
import { FlagComponent } from '../../../../shared/components/flag/flag.component';

export interface CityDeleteRequest {
  city: CityResponse;
  country: CountryResponse;
}

// "By country" list from the design: one panel per visited country with its cities. Trip rows (dates, edit)
// replace the delete button once the API has trips; the Timeline tab arrives with them.
@Component({
  selector: 'app-country-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [I18nPluralPipe, MatButtonModule, MatExpansionModule, MatIconModule, FlagComponent],
  templateUrl: './country-list-component.html',
  styleUrl: './country-list-component.css',
})
export class CountryListComponent {
  readonly countries = input.required<CountryResponse[]>();
  /** ISO code of the open panel; two-way so a globe click can open one and the list can close it */
  readonly selected = model<string | null>(null);
  readonly deleteCity = output<CityDeleteRequest>();

  protected readonly cityCount = { '=1': '1 city', other: '# cities' };
  /** Each city's display name by id: "Portland, Maine" only where the name alone would be ambiguous */
  protected readonly labels = computed(
    () => new Map(this.countries().flatMap((country) => [...cityLabels(country.cities ?? [])])),
  );

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private focusAfterDelete: HTMLElement | null = null;

  constructor() {
    // Both of these touch the DOM, so they must see it updated: a plain effect() runs before the render.

    // Bring a country picked on the globe into view. `countries` is read too because a country that was just
    // added is selected before the refresh delivers its panel.
    afterRenderEffect(() => {
      const code = this.selected();
      this.countries();
      if (!code) return;
      const panel = this.host.nativeElement.querySelector(`[data-country="${code}"]`);
      panel?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    });

    // Removing a row drops the focus to <body>, sending keyboard users back to the top of the page.
    // Only step in if focus really was lost, not if the user has moved on while the list refreshed.
    afterRenderEffect(() => {
      this.countries();
      const target = this.focusAfterDelete;
      this.focusAfterDelete = null;
      if (document.activeElement === document.body) target?.focus();
    });
  }

  protected toggled(code: string, expanded: boolean): void {
    if (expanded) {
      this.selected.set(code);
    } else if (this.selected() === code) {
      this.selected.set(null);
    }
  }

  protected askToDelete(request: CityDeleteRequest, row: HTMLElement): void {
    this.focusAfterDelete = neighbourOf(row);
    this.deleteCity.emit(request);
  }
}

// What's next to a city row: another city's delete button, or if it's the country's last city (the country
// leaves the list with it) the next country's header
function neighbourOf(row: HTMLElement): HTMLElement | null {
  const panel = row.closest('mat-expansion-panel');
  return (
    (row.nextElementSibling ?? row.previousElementSibling)?.querySelector('button') ??
    (panel?.nextElementSibling ?? panel?.previousElementSibling)?.querySelector<HTMLElement>(
      'mat-expansion-panel-header',
    ) ??
    null
  );
}
