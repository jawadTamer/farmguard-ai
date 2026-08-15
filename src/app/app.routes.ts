import { Routes } from '@angular/router';

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


  // =====================================================
  // DASHBOARD
  // =====================================================

  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component')
        .then(m => m.DashboardComponent),
    canActivate: [authGuard]
  },


  // =====================================================
  // CROPS
  // =====================================================

  {
    path: 'crops',
    canActivate: [authGuard],
    children: [

      {
        path: '',
        loadComponent: () =>
          import('./features/crops/crop-list/crop-list.component')
            .then(m => m.CropListComponent)
      },

      {
        path: 'create',
        loadComponent: () =>
          import('./features/crops/crop-create/crop-create.component')
            .then(m => m.CropCreateComponent)
      },

      {
        path: ':id',
        loadComponent: () =>
          import('./features/crops/crop-details/crop-details.component')
            .then(m => m.CropDetailsComponent)
      },

      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/crops/crop-edit/crop-edit.component')
            .then(m => m.CropEditComponent)
      }

    ]
  },


  // =====================================================
  // FARMS
  // =====================================================

  {
    path: 'farms',
    canActivate: [authGuard],
    children: [

      {
        path: '',
        loadComponent: () =>
          import('./features/farms/farm-list/farm-list.component')
            .then(m => m.FarmListComponent)
      },

      {
        path: 'create',
        loadComponent: () =>
          import('./features/farms/farm-create/farm-create.component')
            .then(m => m.FarmCreateComponent)
      },

      {
        path: ':id',
        loadComponent: () =>
          import('./features/farms/farm-details/farm-details.component')
            .then(m => m.FarmDetailsComponent)
      },

      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/farms/farm-edit/farm-edit.component')
            .then(m => m.FarmEditComponent)
      }

    ]
  },


  // =====================================================
  // LIVESTOCK
  // =====================================================

  {
    path: 'livestock',
    canActivate: [authGuard],
    children: [

      {
        path: '',
        loadComponent: () =>
          import('./features/livestock/livestock-list/livestock-list.component')
            .then(m => m.LivestockListComponent)
      },

      {
        path: 'create',
        loadComponent: () =>
          import('./features/livestock/livestock-create/livestock-create.component')
            .then(m => m.LivestockCreateComponent)
      },

      {
        path: ':id',
        loadComponent: () =>
          import('./features/livestock/livestock-details/livestock-details.component')
            .then(m => m.LivestockDetailsComponent)
      }

    ]
  },


  // =====================================================
  // HEAT INTELLIGENCE
  // =====================================================

  {
    path: 'heat-intelligence',
    canActivate: [authGuard],
    children: [

      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'overview'
      },

      {
        path: 'overview',
        loadComponent: () =>
          import('./features/heat-intelligence/overview/overview.component')
            .then(m => m.OverviewComponent)
      },

      {
        path: 'forecast',
        loadComponent: () =>
          import('./features/heat-intelligence/forecast/forecast.component')
            .then(m => m.ForecastComponent)
      },

      {
        path: 'heatmap',
        loadComponent: () =>
          import('./features/heat-intelligence/heatmap/heatmap.component')
            .then(m => m.HeatmapComponent)
      },

      {
        path: 'risk-analysis',
        loadComponent: () =>
          import('./features/heat-intelligence/risk-analysis/risk-analysis.component')
            .then(m => m.RiskAnalysisComponent)
      },

      {
        path: 'temperature',
        loadComponent: () =>
          import('./features/heat-intelligence/temperature/temperature.component')
            .then(m => m.TemperatureComponent)
      }

    ]
  },


  // =====================================================
  // ALERTS
  // =====================================================

  {
    path: 'alerts',
    canActivate: [authGuard],
    children: [

      {
        path: '',
        loadComponent: () =>
          import('./features/alerts/alert-list/alert-list.component')
            .then(m => m.AlertListComponent)
      },

      {
        path: ':id',
        loadComponent: () =>
          import('./features/alerts/alert-details/alert-details.component')
            .then(m => m.AlertDetailsComponent)
      }

    ]
  },


  // =====================================================
  // RECOMMENDATIONS
  // =====================================================

  {
    path: 'recommendations',
    canActivate: [authGuard],
    children: [

      {
        path: '',
        loadComponent: () =>
          import('./features/recommendations/recommendation-list/recommendation-list.component')
            .then(m => m.RecommendationListComponent)
      },

      {
        path: ':id',
        loadComponent: () =>
          import('./features/recommendations/recommendation-details/recommendation-details.component')
            .then(m => m.RecommendationDetailsComponent)
      }

    ]
  },


  // =====================================================
  // PROFILE
  // =====================================================

  {
    path: 'profile',
    loadComponent: () =>
      import('./features/profile/profile.component')
        .then(m => m.ProfileComponent),
    canActivate: [authGuard]
  },


  // =====================================================
  // SETTINGS
  // =====================================================

  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.component')
        .then(m => m.SettingsComponent),
    canActivate: [authGuard]
  },


  // =====================================================
  // DEFAULT ROUTES
  // =====================================================

  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard'
  },

  {
    path: '**',
    redirectTo: 'dashboard'
  }

];