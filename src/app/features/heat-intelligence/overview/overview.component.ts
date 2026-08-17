import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';

import { FarmService } from '../../../core/services/farm.service';
import { ZoneService } from '../../../core/services/zone.service';
import { TemperatureService } from '../../../core/services/temperature.service';
import { HeatRiskService } from '../../../core/services/heat-risk.service';
import { RecommendationService } from '../../../core/services/recommendation.service';
import { AlertService } from '../../../core/services/alert.service';

import { Farm } from '../../../core/models/farm.model';
import { FarmZone } from '../../../core/models/farm-zone.model';
import { TemperatureReading } from '../../../core/models/temperature.model';
import { HeatRisk } from '../../../core/models/heat-risk.model';
import { Recommendation } from '../../../core/models/recommendation.model';
import { FarmAlert } from '../../../core/models/alert.model';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule
  ],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css'
})
export class OverviewComponent implements OnInit {
  isLoading = true;
  farms: Farm[] = [];
  zones: FarmZone[] = [];

  selectedFarmId?: string;
  selectedZoneId?: string;

  currentTemperature?: TemperatureReading;
  currentRisk?: HeatRisk;
  recommendations: Recommendation[] = [];
  alerts: FarmAlert[] = [];

  constructor(
    private farmService: FarmService,
    private zoneService: ZoneService,
    private temperatureService: TemperatureService,
    private heatRiskService: HeatRiskService,
    private recommendationService: RecommendationService,
    private alertService: AlertService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  private async loadData(): Promise<void> {
    try {
      this.farms = await this.farmService.getFarms();

      if (this.farms.length > 0) {
        this.selectedFarmId = this.farms[0].id;
        await this.loadZones();
        await this.loadHeatIntelligence();
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async onFarmChange(): Promise<void> {
    if (this.selectedFarmId) {
      await this.loadZones();
      this.selectedZoneId = undefined;
      await this.loadHeatIntelligence();
    }
  }

  async onZoneChange(): Promise<void> {
    await this.loadHeatIntelligence();
  }

  private async loadZones(): Promise<void> {
    if (this.selectedFarmId) {
      this.zones = await this.zoneService.getZonesByFarm(this.selectedFarmId);
      if (this.zones.length > 0) {
        this.selectedZoneId = this.zones[0].id;
      }
    }
  }

  private async loadHeatIntelligence(): Promise<void> {
    const farmId = this.selectedFarmId;
    const zoneId = this.selectedZoneId;

    if (!farmId) return;

    const zone = this.zones.find(z => z.id === zoneId);

    this.currentTemperature = this.temperatureService.getCurrentTemperature(farmId, zoneId);

    if (this.currentTemperature) {
      this.currentRisk = this.heatRiskService.calculateRisk(
        this.currentTemperature.temperature,
        farmId,
        zoneId
      );

      this.recommendations = this.recommendationService.generateRecommendations(
        farmId,
        zoneId || '',
        this.currentRisk.riskLevel,
        this.currentTemperature.temperature
      );

      if (this.currentRisk.riskLevel === 'high' || this.currentRisk.riskLevel === 'critical') {
        this.alertService.createAlert(
          farmId,
          zoneId || '',
          this.currentRisk.riskLevel,
          this.currentTemperature.temperature,
          zone?.name
        );
      }
    }

    this.alerts = this.alertService.getUnreadAlerts(farmId, zoneId);
  }

  getRiskColor(riskLevel: string): string {
    const colors = {
      low: '#2e7d32',
      moderate: '#f57c00',
      high: '#d32f2f',
      critical: '#b71c1c'
    };
    return colors[riskLevel as keyof typeof colors] || '#757575';
  }

  getPriorityColor(priority: string): string {
    const colors = {
      low: '#2e7d32',
      medium: '#f57c00',
      high: '#d32f2f',
      urgent: '#b71c1c'
    };
    return colors[priority as keyof typeof colors] || '#757575';
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }
}
