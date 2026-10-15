import type { Routes } from '@angular/router';
import { guestGuard } from './core/auth-guards';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage) },
  { path: '**', redirectTo: 'login' },
];
