import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.initialize();

  if (await authService.hasValidSession()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
