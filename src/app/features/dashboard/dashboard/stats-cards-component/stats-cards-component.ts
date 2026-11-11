import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { StatsSummaryResponse } from '../../../../core/models/travel.model';

// The stats from the design: cards on desktop, plain big numbers on a phone. Newest country and Trips this
// year join them with the stats API (plan step B4). Countries and cities come from the API's summary; the
// trip count and the two shares are worked out client-side for now.
@Component({
  selector: 'app-stats-cards',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, PercentPipe, MatIconModule, MatProgressBarModule],
  templateUrl: './stats-cards-component.html',
  styleUrl: './stats-cards-component.css',
})
export class StatsCardsComponent {
  readonly stats = input.required<StatsSummaryResponse>();
  /** Trips taken (counted from the trip list until the stats summary has it) */
  readonly trips = input.required<number>();
  /** Sovereign states visited, out of `countriesTotal` (territories don't count towards this share) */
  readonly countriesVisited = input.required<number>();
  readonly countriesTotal = input.required<number>();
  /** Share of world land (0–1); null while the country shapes are still loading */
  readonly landShare = input<number | null>(null);

  protected readonly countryShare = computed(() =>
    this.countriesTotal() ? this.countriesVisited() / this.countriesTotal() : 0,
  );
  // Rounded like the labels (one decimal), so the bars and screen readers agree with what's shown
  protected readonly countryPercent = computed(() => toPercent(this.countryShare()));
  protected readonly landPercent = computed(() => toPercent(this.landShare() ?? 0));
}

function toPercent(share: number): number {
  return Math.round(share * 1000) / 10;
}
