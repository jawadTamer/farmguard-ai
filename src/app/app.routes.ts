import { Routes } from '@angular/router';

import { AppLayoutComponent } from './layout/app-layout/app-layout.component';

import { LoginComponent } from './features/auth/login/login.component';
import { SignupComponent } from './features/auth/signup/signup.component';
import { ForgotPasswordComponent } from './features/auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './features/auth/reset-password/reset-password.component';

import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  // =====================================================
  // AUTH
  // =====================================================

  {
    path: 'login',
    component: LoginComponent,
  },

  {
    path: 'signup',
    component: SignupComponent,
  },

  {
    path: 'forgot-password',
    component: ForgotPasswordComponent,
  },

  {
    path: 'reset-password',
    component: ResetPasswordComponent,
  },

  // =====================================================
  // AUTHENTICATED APP
  // =====================================================

  {
    path: '',
    component: AppLayoutComponent,
    canActivate: [authGuard],

    children: [
      // =================================================
      // DEFAULT
      // /
      // → /dashboard
      // =================================================

      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },

      // =================================================
      // DASHBOARD
      // =================================================

      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },

      // =================================================
      // FARMS
      // =================================================

      {
        path: 'farms',
        children: [
          // /farms
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./features/farms/farm-list/farm-list.component').then(
                (m) => m.FarmListComponent,
              ),
          },

          // /farms/create
          {
            path: 'create',
            loadComponent: () =>
              import('./features/farms/farm-create/farm-create.component').then(
                (m) => m.FarmCreateComponent,
              ),
          },

          // IMPORTANT:
          // edit MUST come before :id
          //
          // /farms/:id/edit
          {
            path: ':id/edit',
            loadComponent: () =>
              import('./features/farms/farm-edit/farm-edit.component').then(
                (m) => m.FarmEditComponent,
              ),
          },

          // /farms/:id
          {
            path: ':id',
            loadComponent: () =>
              import('./features/farms/farm-details/farm-details.component').then(
                (m) => m.FarmDetailsComponent,
              ),
          },
        ],
      },

      // =================================================
      // ZONES
      // =================================================

      {
        path: 'zones',
        children: [
          // /zones
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./features/zones/zone-list/zone-list.component').then(
                (m) => m.ZoneListComponent,
              ),
          },

          // /zones/create
          {
            path: 'create',
            loadComponent: () =>
              import('./features/zones/zone-create/zone-create.component').then(
                (m) => m.ZoneCreateComponent,
              ),
          },

          // IMPORTANT:
          // edit MUST come before :zoneId
          //
          // /zones/:zoneId/edit
          {
            path: ':zoneId/edit',
            loadComponent: () =>
              import('./features/zones/zone-edit/zone-edit.component').then(
                (m) => m.ZoneEditComponent,
              ),
          },

          // /zones/:zoneId
          {
            path: ':zoneId',
            loadComponent: () =>
              import('./features/zones/zone-details/zone-details.component').then(
                (m) => m.ZoneDetailsComponent,
              ),
          },
        ],
      },

      // =================================================
      // FARM → ZONES
      // =================================================
      //
      // Examples:
      //
      // /farms/farm-001/zones
      // /farms/farm-001/zones/create
      // /farms/farm-001/zones/zone-001
      // /farms/farm-001/zones/zone-001/edit
      //

      {
        path: 'farms/:farmId/zones',
        children: [
          // /farms/:farmId/zones
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./features/zones/zone-list/zone-list.component').then(
                (m) => m.ZoneListComponent,
              ),
          },

          // /farms/:farmId/zones/create
          {
            path: 'create',
            loadComponent: () =>
              import('./features/zones/zone-create/zone-create.component').then(
                (m) => m.ZoneCreateComponent,
              ),
          },

          // /farms/:farmId/zones/:zoneId/edit
          {
            path: ':zoneId/edit',
            loadComponent: () =>
              import('./features/zones/zone-edit/zone-edit.component').then(
                (m) => m.ZoneEditComponent,
              ),
          },

          // /farms/:farmId/zones/:zoneId
          {
            path: ':zoneId',
            loadComponent: () =>
              import('./features/zones/zone-details/zone-details.component').then(
                (m) => m.ZoneDetailsComponent,
              ),
          },
        ],
      },

      // =================================================
      // CROPS
      // =================================================

      {
        path: 'crops',
        children: [
          // /crops
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./features/crops/crop-list/crop-list.component').then(
                (m) => m.CropListComponent,
              ),
          },

          // /crops/create
          {
            path: 'create',
            loadComponent: () =>
              import('./features/crops/crop-create/crop-create.component').then(
                (m) => m.CropCreateComponent,
              ),
          },

          // /crops/:id/edit
          {
            path: ':id/edit',
            loadComponent: () =>
              import('./features/crops/crop-edit/crop-edit.component').then(
                (m) => m.CropEditComponent,
              ),
          },

          // /crops/:id
          {
            path: ':id',
            loadComponent: () =>
              import('./features/crops/crop-details/crop-details.component').then(
                (m) => m.CropDetailsComponent,
              ),
          },
        ],
      },

      // =================================================
      // LIVESTOCK
      // =================================================

      {
        path: 'livestock',
        children: [
          // /livestock
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./features/livestock/livestock-list/livestock-list.component').then(
                (m) => m.LivestockListComponent,
              ),
          },

          // /livestock/create
          {
            path: 'create',
            loadComponent: () =>
              import('./features/livestock/livestock-create/livestock-create.component').then(
                (m) => m.LivestockCreateComponent,
              ),
          },

          // /livestock/:id/edit
          {
            path: ':id/edit',
            loadComponent: () =>
              import('./features/livestock/livestock-edit/livestock-edit.component').then(
                (m) => m.LivestockEditComponent,
              ),
          },

          // /livestock/:id
          {
            path: ':id',
            loadComponent: () =>
              import('./features/livestock/livestock-details/livestock-details.component').then(
                (m) => m.LivestockDetailsComponent,
              ),
          },
        ],
      },

      // =================================================
      // HEAT INTELLIGENCE
      // =================================================

      {
        path: 'heat-intelligence',

        children: [
          // /heat-intelligence
          // → /heat-intelligence/overview
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'overview',
          },

          // /heat-intelligence/overview
          {
            path: 'overview',
            loadComponent: () =>
              import('./features/heat-intelligence/overview/overview.component').then(
                (m) => m.OverviewComponent,
              ),
          },

          // /heat-intelligence/forecast
          {
            path: 'forecast',
            loadComponent: () =>
              import('./features/heat-intelligence/forecast/forecast.component').then(
                (m) => m.ForecastComponent,
              ),
          },

          // /heat-intelligence/heatmap
          {
            path: 'heatmap',
            loadComponent: () =>
              import('./features/heat-intelligence/heatmap/heatmap.component').then(
                (m) => m.HeatmapComponent,
              ),
          },

          // /heat-intelligence/risk-analysis
          {
            path: 'risk-analysis',
            loadComponent: () =>
              import('./features/heat-intelligence/risk-analysis/risk-analysis.component').then(
                (m) => m.RiskAnalysisComponent,
              ),
          },

          // /heat-intelligence/temperature
          {
            path: 'temperature',
            loadComponent: () =>
              import('./features/heat-intelligence/temperature/temperature.component').then(
                (m) => m.TemperatureComponent,
              ),
          },
        ],
      },

      // =================================================
      // ALERTS
      // =================================================

      {
        path: 'alerts',
        children: [
          // /alerts
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./features/alerts/alert-list/alert-list.component').then(
                (m) => m.AlertListComponent,
              ),
          },

          // /alerts/:id
          {
            path: ':id',
            loadComponent: () =>
              import('./features/alerts/alert-details/alert-details.component').then(
                (m) => m.AlertDetailsComponent,
              ),
          },
        ],
      },

      // =================================================
      // RECOMMENDATIONS / AI ADVISOR
      // =================================================

      {
        path: 'recommendations',
        children: [
          // /recommendations
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./features/recommendations/recommendation-list/recommendation-list.component').then(
                (m) => m.RecommendationListComponent,
              ),
          },

          // /recommendations/:id
          {
            path: ':id',
            loadComponent: () =>
              import('./features/recommendations/recommendation-details/recommendation-details.component').then(
                (m) => m.RecommendationDetailsComponent,
              ),
          },
        ],
      },

      // =================================================
      // PROFILE
      // =================================================

      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile.component').then(
            (m) => m.ProfileComponent,
          ),
      },

      // =================================================
      // SETTINGS
      // =================================================

      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then(
            (m) => m.SettingsComponent,
          ),
      },
    ],
  },

  // =====================================================
  // UNKNOWN ROUTES
  // =====================================================

  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
