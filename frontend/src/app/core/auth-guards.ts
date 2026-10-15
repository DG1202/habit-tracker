import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthStore } from './auth-store';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const user = await auth.ensureLoaded();
  if (user === undefined) {
    auth.markUnreachable(state.url);
    return false;
  }
  return user ? true : router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const user = await auth.ensureLoaded();
  if (user === undefined) {
    auth.markUnreachable(state.url);
    return false;
  }
  return user ? router.createUrlTree(['/']) : true;
};
