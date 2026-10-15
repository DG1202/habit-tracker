import type { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth-guards';

export const routes: Routes = [
  { path: 'login', title: 'Sign in · Habit Tracker', canActivate: [guestGuard], loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage) },
  { path: '', title: 'My habits · Habit Tracker', canActivate: [authGuard], loadComponent: () => import('./features/habits/habits-page').then((m) => m.HabitsPage) },
  { path: 'habits/:id', title: 'Habit details · Habit Tracker', canActivate: [authGuard], loadComponent: () => import('./features/habit-details/habit-details-page').then((m) => m.HabitDetailsPage) },
  { path: '**', redirectTo: '' },
];
