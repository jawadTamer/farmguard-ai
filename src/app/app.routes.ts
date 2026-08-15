import { Routes } from '@angular/router';

import { LoginComponent } from './features/auth/login/login.component';
import { SignupComponent } from './features/auth/signup/signup.component';
import { ForgotPasswordComponent } from './features/auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './features/auth/reset-password/reset-password.component';

import { DashboardComponent } from './features/dashboard/dashboard.component';

import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [

  // Public routes
  {
    path: 'login',
    component: LoginComponent
  },

  {
    path: 'signup',
    component: SignupComponent
  },

  {
    path: 'forgot-password',
    component: ForgotPasswordComponent
  },

  {
    path: 'reset-password',
    component: ResetPasswordComponent
  },

  // Protected routes
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard]
  },

  // Default
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },

  {
    path: '**',
    redirectTo: 'dashboard'
  }
];