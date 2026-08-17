import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { TemperatureService } from '../../core/services/temperature.service';
import { FarmService } from '../../core/services/farm.service';
import { HeatRiskService } from '../../core/services/heat-risk.service';
import { AlertService } from '../../core/services/alert.service';
import { Farm } from '../../core/models/farm.model';

interface StatCard {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
  status?: 'normal' | 'warning' | 'danger';
}

interface TemperaturePoint {
  time: string;
  temperature: number;
}

interface RiskItem {
  name: string;
  type: string;
  level: 'Low' | 'Moderate' | 'High';
  temperature: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,

  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatChipsModule,
    MatProgressBarModule,
    MatIconModule,
    MatMenuModule,
  ],

  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  // =====================================================
  // Constructor / Services
  // =====================================================

  constructor(
    private temperatureService: TemperatureService,
    private farmService: FarmService,
    private heatRiskService: HeatRiskService,
    private alertService: AlertService,
  ) {}

  // =====================================================
  // Header
  // =====================================================

  userName = 'Jawad';

  currentDate = new Date();

  // =====================================================
  // Current Farm Status
  // =====================================================

  currentTemperature = 0;

  feelsLike = 0;

  temperatureStatus = 'Loading...';

  temperatureDescription = 'Loading current temperature information...';

  // =====================================================
  // Statistics
  // =====================================================

  stats: StatCard[] = [
    {
      title: 'Current Temperature',
      value: '--',
      subtitle: 'Loading...',
      icon: 'thermostat',
      status: 'normal',
    },

    {
      title: 'Active Farms',
      value: '0',
      subtitle: 'Loading farms...',
      icon: 'agriculture',
      status: 'normal',
    },

    {
      title: 'Heat Risk',
      value: '0',
      subtitle: 'Areas need attention',
      icon: 'warning',
      status: 'normal',
    },

    {
      title: 'Active Alerts',
      value: '0',
      subtitle: 'No active alerts',
      icon: 'notifications_active',
      status: 'normal',
    },
  ];

  // =====================================================
  // Temperature Trend
  // =====================================================

  temperaturePoints: TemperaturePoint[] = [
    {
      time: '06 AM',
      temperature: 25,
    },

    {
      time: '08 AM',
      temperature: 28,
    },

    {
      time: '10 AM',
      temperature: 33,
    },

    {
      time: '12 PM',
      temperature: 37,
    },

    {
      time: '02 PM',
      temperature: 41,
    },

    {
      time: '04 PM',
      temperature: 39,
    },

    {
      time: '06 PM',
      temperature: 34,
    },

    {
      time: '08 PM',
      temperature: 30,
    },
  ];

  // =====================================================
  // Risk Areas
  // =====================================================

  riskAreas: RiskItem[] = [];

  // =====================================================
  // AI Recommendations
  // =====================================================

  recommendations = [
    {
      icon: 'water_drop',

      title: 'Irrigation recommended',

      description: 'Consider irrigation during the cooler evening period.',

      priority: 'High',
    },

    {
      icon: 'wb_sunny',

      title: 'Avoid peak heat',

      description: 'Avoid spraying during peak afternoon temperatures.',

      priority: 'Moderate',
    },

    {
      icon: 'monitoring',

      title: 'Increase monitoring',

      description: 'Monitor high-risk crop areas during the next 24 hours.',

      priority: 'Moderate',
    },
  ];

  // =====================================================
  // Quick Actions
  // =====================================================

  quickActions = [
    {
      icon: 'add_home',

      label: 'Add Farm',

      route: '/farms/create',
    },

    {
      icon: 'grass',

      label: 'Add Crop',

      route: '/crops/create',
    },

    {
      icon: 'pets',

      label: 'Add Livestock',

      route: '/livestock/create',
    },

    {
      icon: 'analytics',

      label: 'Heat Intelligence',

      route: '/heat-intelligence',
    },
  ];

  // =====================================================
  // Lifecycle
  // =====================================================

  async ngOnInit(): Promise<void> {
    this.currentDate = new Date();

    await this.loadTemperature();

    this.loadFarms();

    await this.loadHeatRisks();

    await this.loadAlerts();
  }

  // =====================================================
  // Load Temperature
  // =====================================================

  private async loadTemperature(): Promise<void> {
    const temperature = await this.temperatureService.getCurrentTemperature();

    this.currentTemperature = temperature.temperature;

    this.feelsLike = temperature.feelsLike ?? temperature.temperature;

    this.updateTemperatureStatus(this.currentTemperature);

    this.updateTemperatureStat();
  }

  // =====================================================
  // Temperature Status
  // =====================================================

  private updateTemperatureStatus(temperature: number): void {
    if (temperature >= 42) {
      this.temperatureStatus = 'Critical Heat Risk';

      this.temperatureDescription =
        'Temperature has reached a critical level and immediate action may be required.';

      return;
    }

    if (temperature >= 38) {
      this.temperatureStatus = 'High Heat Risk';

      this.temperatureDescription =
        'Temperature is above the optimal range for some crops.';

      return;
    }

    if (temperature >= 34) {
      this.temperatureStatus = 'Moderate Heat Risk';

      this.temperatureDescription =
        'Temperature is approaching the upper safe range.';

      return;
    }

    this.temperatureStatus = 'Low Heat Risk';

    this.temperatureDescription =
      'Temperature is currently within a safe range.';
  }

  // =====================================================
  // Update Temperature Stat
  // =====================================================

  private updateTemperatureStat(): void {
    const temperatureStat = this.stats[0];

    temperatureStat.value = `${this.currentTemperature}°C`;

    temperatureStat.subtitle = `Feels like ${this.feelsLike}°C`;

    if (this.currentTemperature >= 42) {
      temperatureStat.status = 'danger';
    } else if (this.currentTemperature >= 38) {
      temperatureStat.status = 'danger';
    } else if (this.currentTemperature >= 34) {
      temperatureStat.status = 'warning';
    } else {
      temperatureStat.status = 'normal';
    }
  }

  // =====================================================
  // Load Farms
  // =====================================================

  private async loadFarms(): Promise<void> {
    try {
      const farms = await this.farmService.getFarms();

      const activeFarms = farms.filter(
        (farm: Farm) => farm.status === 'active',
      );

      this.stats[1].value = activeFarms.length.toString();

      this.stats[1].subtitle =
        activeFarms.length === 1 ? '1 farm monitored' : 'All farms monitored';
    } catch (error) {
      console.error('Failed to load farms for dashboard:', error);

      this.stats[1].value = '0';

      this.stats[1].subtitle = 'Unable to load farms';
    }
  }

  // =====================================================
  // Load Heat Risks
  // =====================================================

  private async loadHeatRisks(): Promise<void> {
    const risks = await this.heatRiskService.getRisks();

    const attentionRisks = risks.filter(
      (risk: any) => risk.riskLevel === 'high' || risk.riskLevel === 'critical',
    );

    this.stats[2].value = attentionRisks.length.toString();

    this.stats[2].subtitle =
      attentionRisks.length === 0
        ? 'No areas need attention'
        : attentionRisks.length === 1
          ? '1 area needs attention'
          : 'Areas need attention';

    // ================================================
    // Convert service data to Dashboard RiskItem
    // ================================================

    this.riskAreas = risks.map((risk: any) => {
      let level: 'Low' | 'Moderate' | 'High';

      switch (risk.riskLevel) {
        case 'critical':
        case 'high':
          level = 'High';

          break;

        case 'moderate':
          level = 'Moderate';

          break;

        default:
          level = 'Low';
      }

      return {
        name: this.getRiskAreaName(risk.id),

        type: this.getRiskAreaType(risk.id),

        level,

        temperature: risk.temperature,
      };
    });
  }

  // =====================================================
  // Risk Area Name
  // =====================================================

  private getRiskAreaName(riskId?: string): string {
    switch (riskId) {
      case 'risk-001':
        return 'Tomato Field A';

      case 'risk-002':
        return 'Greenhouse B';

      case 'risk-003':
        return 'Corn Field';

      default:
        return 'Farm Area';
    }
  }

  // =====================================================
  // Risk Area Type
  // =====================================================

  private getRiskAreaType(riskId?: string): string {
    switch (riskId) {
      case 'risk-001':
        return 'Tomato · Flowering';

      case 'risk-002':
        return 'Cucumber · Fruiting';

      case 'risk-003':
        return 'Corn · Vegetative';

      default:
        return 'Unknown Crop';
    }
  }

  // =====================================================
  // Load Alerts
  // =====================================================

  private async loadAlerts(): Promise<void> {
    const alerts = await this.alertService.getAlerts();

    const activeAlerts = alerts.filter((alert: any) => !alert.isRead);

    const criticalAlerts = activeAlerts.filter(
      (alert: any) => alert.severity === 'critical',
    );

    this.stats[3].value = activeAlerts.length.toString();

    if (activeAlerts.length === 0) {
      this.stats[3].subtitle = 'No active alerts';

      this.stats[3].status = 'normal';

      return;
    }

    this.stats[3].subtitle =
      criticalAlerts.length === 1
        ? '1 critical alert'
        : criticalAlerts.length > 1
          ? `${criticalAlerts.length} critical alerts`
          : 'No critical alerts';

    this.stats[3].status = criticalAlerts.length > 0 ? 'danger' : 'warning';
  }

  // =====================================================
  // Refresh Dashboard
  // =====================================================

  async refreshDashboard(): Promise<void> {
    this.currentDate = new Date();

    await this.loadTemperature();

    this.loadFarms();

    await this.loadHeatRisks();

    await this.loadAlerts();
  }

  // =====================================================
  // Get Maximum Temperature
  // =====================================================

  getMaxTemperature(): number {
    if (!this.temperaturePoints.length) {
      return 0;
    }

    return Math.max(
      ...this.temperaturePoints.map((point) => point.temperature),
    );
  }

  // =====================================================
  // Get Minimum Temperature
  // =====================================================

  getMinTemperature(): number {
    if (!this.temperaturePoints.length) {
      return 0;
    }

    return Math.min(
      ...this.temperaturePoints.map((point) => point.temperature),
    );
  }

  // =====================================================
  // Risk Class
  // =====================================================

  getRiskClass(level: string): string {
    switch (level) {
      case 'High':
        return 'risk-high';

      case 'Moderate':
        return 'risk-moderate';

      default:
        return 'risk-low';
    }
  }

  // =====================================================
  // Status Class
  // =====================================================

  getStatusClass(status?: string): string {
    switch (status) {
      case 'danger':
        return 'status-danger';

      case 'warning':
        return 'status-warning';

      default:
        return 'status-normal';
    }
  }

  // =====================================================
  // Temperature Status Class
  // =====================================================

  getTemperatureStatusClass(): string {
    if (this.currentTemperature >= 42) {
      return 'status-danger';
    }

    if (this.currentTemperature >= 38) {
      return 'status-danger';
    }

    if (this.currentTemperature >= 34) {
      return 'status-warning';
    }

    return 'status-normal';
  }

  // =====================================================
  // Recommendation Priority Class
  // =====================================================

  getRecommendationClass(priority: string): string {
    switch (priority) {
      case 'High':
        return 'priority-high';

      case 'Moderate':
        return 'priority-moderate';

      default:
        return 'priority-low';
    }
  }
}
