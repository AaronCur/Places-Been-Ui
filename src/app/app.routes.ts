import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard/dashboard-component/dashboard-component';

export const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: '**', redirectTo: '' },
];
