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
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSelectModule, MatFormFieldModule, MatTabsModule, MatTableModule],
  templateUrl: './temperature.component.html',
  styleUrl: './temperature.component.css'
})
export class TemperatureComponent implements OnInit {
  isLoading = true;
  isRefreshing = false;
  loadError?: string;
  farms: Farm[] = [];
  zones: FarmZone[] = [];
  selectedFarmId?: string;
  selectedZoneId?: string;
  currentTemperature?: TemperatureReading;
  temperatureHistory: TemperatureReading[] = [];
  displayedColumns: string[] = ['time', 'temperature', 'feelsLike', 'humidity', 'source'];

  constructor(private farmService: FarmService, private zoneService: ZoneService, private temperatureService: TemperatureService) { }

  async ngOnInit(): Promise<void> { await this.loadData(); }

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
      this.loadError = this.getErrorMessage(error);
    } finally {
      this.isLoading = false;
    }
  }

  async onFarmChange(): Promise<void> {
    if (this.selectedFarmId) {
      this.currentTemperature = undefined;
      await this.loadZones();
      this.selectedZoneId = this.zones.length ? this.zones[0].id : undefined;
      await this.loadTemperatureData();
    }
  }

  async onZoneChange(): Promise<void> { this.currentTemperature = undefined; await this.loadTemperatureData(); }

  private async loadZones(): Promise<void> {
    if (!this.selectedFarmId) return;
    this.zones = await this.zoneService.getZonesByFarm(this.selectedFarmId);
    this.selectedZoneId = this.zones.length ? this.zones[0].id : undefined;
  }

  private async loadTemperatureData(): Promise<void> {
    const farmId = this.selectedFarmId;
    const zoneId = this.selectedZoneId;
    if (!farmId) return;

    this.loadError = undefined;
    this.isRefreshing = true;
    try {
      console.log('[Temperature] Calling FortyGuard through Supabase', { farmId, zoneId });
      this.currentTemperature = await this.temperatureService.getCurrentTemperature(farmId, zoneId);
      console.log('[Temperature] COMPLETED RESULT RECEIVED:', this.currentTemperature);
      this.temperatureHistory = await this.temperatureService.getTemperatureHistory(farmId, zoneId, 7);
    } catch (error) {
      console.error('[Temperature] Failed to load temperature data:', error);
      this.currentTemperature = undefined;
      this.loadError = this.getErrorMessage(error);
    } finally {
      this.isRefreshing = false;
    }
  }

  async refreshTemperature(): Promise<void> {
    if (this.isRefreshing) return;
    await this.loadTemperatureData();
  }

  private getErrorMessage(error: unknown): string {
    const message = (error as Error)?.message || 'Unknown error occurred';
    if (message.includes('latitude') || message.includes('longitude')) return 'Location coordinates are required. Please add a valid location to your farm or zone.';
    if (message.includes('API key') || message.includes('FORTYGUARD_API_KEY')) return 'Temperature service is not configured. Please contact your administrator.';
    if (message.includes('401') || message.includes('403')) return 'Temperature service authentication failed. Please contact your administrator.';
    if (message.includes('429')) return 'Temperature service rate limit reached. Please try again later.';
    if (message.includes('timeout')) return 'FortyGuard took too long to complete the activity. Please try again.';
    if (message.includes('network')) return 'Unable to connect to temperature service. Please check your connection.';
    return message.includes('FortyGuard') ? message : 'Unable to load temperature data. Please try again.';
  }

  getSafeValue(value: number | undefined | null): string {
    if (value === undefined || value === null || !Number.isFinite(value)) return '—';
    return this.formatOneDecimal(value);
  }

  getProcessingTime(): string {
    const diagnostics = this.currentTemperature?.diagnostics as any;
    return diagnostics?.processingTimeSeconds ? diagnostics.processingTimeSeconds.toString() : '';
  }

  formatHumidity(value: number | undefined | null): string {
    const safeValue = this.getSafeValue(value);
    return safeValue === '—' ? '—' : `${safeValue}%`;
  }

  formatPrecipitation(value: number | undefined | null): string {
    const safeValue = this.getSafeValue(value);
    return safeValue === '—' ? '—' : `${safeValue} mm`;
  }

  formatCloudCover(value: number | undefined | null): string {
    const safeValue = this.getSafeValue(value);
    return safeValue === '—' ? '—' : `${safeValue}%`;
  }

  formatTemperature(value: number | undefined | null): string {
    if (value === undefined || value === null || !Number.isFinite(value)) return '—';
    return `${this.formatOneDecimal(value)}°C`;
  }

  formatOneDecimal(value: number | undefined | null): string {
    if (value === undefined || value === null || !Number.isFinite(value)) return '—';
    // Keep the first digit after the decimal without rounding
    const truncated = Math.trunc(Number(value) * 10) / 10;
    return truncated.toFixed(1);
  }

  getSourceLabel(source: string | undefined): string {
    if (!source) return 'Unknown';
    if (source === 'api') return 'FortyGuard';
    if (source === 'mock') return 'Demo data';
    return source;
  }

  getSourceClass(source: string | undefined): string {
    if (!source) return 'source-unknown';
    if (source === 'api') return 'source-fortyguard';
    if (source === 'mock') return 'source-mock';
    return 'source-unknown';
  }

  calculateHeatIndex(temp: number, humidity: number): number {
    if (temp < 27 || humidity < 40) return temp;
    const t = temp, rh = humidity;
    const hi = -8.78469475556 + 1.61139411 * t + 2.33854883889 * rh - 0.14611605 * t * rh - 0.012308094 * t * t - 0.0164248277778 * rh * rh + 0.002211732 * t * t * rh + 0.00072546 * t * rh * rh - 0.000003582 * t * t * rh * rh;
    return Math.round(hi);
  }

  getHeatIndexColor(hi: number): string {
    if (hi < 27) return '#2e7d32';
    if (hi < 32) return '#f57c00';
    if (hi < 41) return '#d32f2f';
    return '#b71c1c';
  }

  formatDate(dateString: string): string { return new Date(dateString).toLocaleString(); }
}
