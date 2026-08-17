import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';

import { FarmService } from '../../../core/services/farm.service';
import { ZoneService } from '../../../core/services/zone.service';
import { TemperatureService } from '../../../core/services/temperature.service';

import { Farm } from '../../../core/models/farm.model';
import { FarmZone } from '../../../core/models/farm-zone.model';
import { TemperatureReading } from '../../../core/models/temperature.model';

@Component({
  selector: 'app-temperature',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTabsModule,
    MatTableModule
  ],
  templateUrl: './temperature.component.html',
  styleUrl: './temperature.component.css'
})
export class TemperatureComponent implements OnInit {
  isLoading = true;
  farms: Farm[] = [];
  zones: FarmZone[] = [];

  selectedFarmId?: string;
  selectedZoneId?: string;

  currentTemperature?: TemperatureReading;
  temperatureHistory: TemperatureReading[] = [];

  displayedColumns: string[] = ['time', 'temperature', 'feelsLike', 'humidity', 'source'];

  constructor(
    private farmService: FarmService,
    private zoneService: ZoneService,
    private temperatureService: TemperatureService
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
        await this.loadTemperatureData();
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
      await this.loadTemperatureData();
    }
  }

  async onZoneChange(): Promise<void> {
    await this.loadTemperatureData();
  }

  private async loadZones(): Promise<void> {
    if (this.selectedFarmId) {
      this.zones = await this.zoneService.getZonesByFarm(this.selectedFarmId);
      if (this.zones.length > 0) {
        this.selectedZoneId = this.zones[0].id;
      }
    }
  }

  private async loadTemperatureData(): Promise<void> {
    const farmId = this.selectedFarmId;
    const zoneId = this.selectedZoneId;

    if (!farmId) return;

    this.currentTemperature = await this.temperatureService.getCurrentTemperature(farmId, zoneId);
    this.temperatureHistory = await this.temperatureService.getTemperatureHistory(farmId, zoneId, 7);
  }

  calculateHeatIndex(temp: number, humidity: number): number {
    if (temp < 27 || humidity < 40) return temp;

    const t = temp;
    const rh = humidity;

    const hi = -8.78469475556 +
      1.61139411 * t +
      2.33854883889 * rh -
      0.14611605 * t * rh -
      0.012308094 * t * t -
      0.0164248277778 * rh * rh +
      0.002211732 * t * t * rh +
      0.00072546 * t * rh * rh -
      0.000003582 * t * t * rh * rh;

    return Math.round(hi);
  }

  getHeatIndexColor(hi: number): string {
    if (hi < 27) return '#2e7d32';
    if (hi < 32) return '#f57c00';
    if (hi < 41) return '#d32f2f';
    return '#b71c1c';
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }
}
