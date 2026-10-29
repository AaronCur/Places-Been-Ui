import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
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

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Bring a country picked on the globe into view
    effect(() => {
      const code = this.selected();
      if (!code) return;
      const panel = this.host.nativeElement.querySelector(`[data-country="${code}"]`);
      panel?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    });
  }

  protected toggled(code: string, expanded: boolean): void {
    if (expanded) {
      this.selected.set(code);
    } else if (this.selected() === code) {
      this.selected.set(null);
    }
  }
}
