import type { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth-guards';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage) },
  { path: '', canActivate: [authGuard], loadComponent: () => import('./features/habits/habits-page').then((m) => m.HabitsPage) },
  { path: 'habits/:id', canActivate: [authGuard], loadComponent: () => import('./features/habit-details/habit-details-page').then((m) => m.HabitDetailsPage) },
  { path: '**', redirectTo: '' },
];
