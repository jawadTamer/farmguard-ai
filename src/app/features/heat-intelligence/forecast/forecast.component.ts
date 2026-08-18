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

import { Farm } from '../../../core/models/farm.model';
import { FarmZone } from '../../../core/models/farm-zone.model';
import { TemperatureForecast } from '../../../core/models/temperature.model';

@Component({
  selector: 'app-forecast',
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
  templateUrl: './forecast.component.html',
  styleUrl: './forecast.component.css'
})
export class ForecastComponent implements OnInit {
  isLoading = true;
  farms: Farm[] = [];
  zones: FarmZone[] = [];

  selectedFarmId?: string;
  selectedZoneId?: string;

  forecast: TemperatureForecast[] = [];

  constructor(
    private farmService: FarmService,
    private zoneService: ZoneService,
    private temperatureService: TemperatureService,
    private heatRiskService: HeatRiskService
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
        await this.loadForecast();
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
      await this.loadForecast();
    }
  }

  async onZoneChange(): Promise<void> {
    await this.loadForecast();
  }

  private async loadZones(): Promise<void> {
    if (this.selectedFarmId) {
      this.zones = await this.zoneService.getZonesByFarm(this.selectedFarmId);
      if (this.zones.length > 0) {
        this.selectedZoneId = this.zones[0].id;
      }
    }
  }

  private async loadForecast(): Promise<void> {
    const farmId = this.selectedFarmId;
    const zoneId = this.selectedZoneId;

    if (!farmId) return;

    this.forecast = await this.temperatureService.getForecast(farmId, zoneId);
  }

  getRiskLevelForTemp(temp: number): string {
    return this.heatRiskService.getRiskLevel(temp);
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

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getConditionIcon(condition: string): string {
    const icons: { [key: string]: string } = {
      'Sunny': 'wb_sunny',
      'Clear': 'wb_sunny',
      'Hot': 'whatshot',
      'Cloudy': 'cloud',
      'Partly Cloudy': 'partly_cloudy',
      'Rain': 'grain',
      'Storm': 'thunderstorm'
    };
    return icons[condition] || 'wb_sunny';
  }
}
