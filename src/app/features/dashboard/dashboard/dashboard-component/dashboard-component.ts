// src/app/features/dashboard/dashboard.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

// Angular Material Imports
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import {TravelService} from '../../../../core/services/travel.service';
import {CountryResponse, DashboardSummaryResponse} from '../../../../core/models/travel.model';


@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatExpansionModule,
    MatProgressBarModule,
    MatToolbarModule
  ],
  templateUrl: './dashboard-component.html',
  styleUrls: ['./dashboard-component.css']
})
export class DashboardComponent implements OnInit {
  private travelService = inject(TravelService);

  // Using Modern Angular Signals for UI State
  stats = signal<DashboardSummaryResponse | null>(null);
  countries = signal<CountryResponse[]>([]);
  isLoading = signal<boolean>(true);

  ngOnInit(): void {
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.isLoading.set(true);

    // Fetch stats
    this.travelService.getStatsSummary().subscribe(data => this.stats.set(data));

    // Fetch countries with nested cities
    this.travelService.getCountries(true).subscribe({
      next: (data) => {
        this.countries.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.isLoading.set(false);
      }
    });
  }

  onDeleteCity(cityId: number, event: Event): void {
    event.stopPropagation(); // Prevents the accordion panel from toggling when clicking delete
    if (confirm('Are you sure you want to remove this city?')) {
      this.travelService.deleteCity(cityId).subscribe(() => {
        this.loadDashboardData(); // Refresh signals data stream
      });
    }
  }
}
