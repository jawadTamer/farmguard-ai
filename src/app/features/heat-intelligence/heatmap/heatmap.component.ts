import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';

import { FarmService } from '../../../core/services/farm.service';
import { ZoneService } from '../../../core/services/zone.service';
import { HeatRiskService } from '../../../core/services/heat-risk.service';
import {
  FortyGuardSatelliteProvider,
  SatelliteSegmentationResult,
} from '../../../core/providers/fortyguard-satellite.provider';
import { SupabaseService } from '../../../core/services/supabase.service';

import { Farm } from '../../../core/models/farm.model';
import { FarmZone } from '../../../core/models/farm-zone.model';
import { HeatRisk } from '../../../core/models/heat-risk.model';

import L from 'leaflet';

@Component({
  selector: 'app-heatmap',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    MatChipsModule,
  ],
  templateUrl: './heatmap.component.html',
  styleUrl: './heatmap.component.css',
})
export class HeatmapComponent implements OnInit, AfterViewInit, OnDestroy {
  isLoading = true;
  isSatelliteLoading = false;
  satelliteError: string | null = null;
  satellite: SatelliteSegmentationResult | null = null;

  farms: Farm[] = [];
  zones: FarmZone[] = [];
  selectedFarmId?: string;
  selectedZoneId?: string;
  risks: HeatRisk[] = [];
  zoneRisks: { [zoneId: string]: HeatRisk } = {};

  map?: L.Map;
  markers: L.CircleMarker[] = [];
  private viewInitialized = false;
  private readonly satelliteProvider: FortyGuardSatelliteProvider;

  constructor(
    private farmService: FarmService,
    private zoneService: ZoneService,
    private heatRiskService: HeatRiskService,
    supabaseService: SupabaseService,
  ) {
    this.satelliteProvider = new FortyGuardSatelliteProvider(supabaseService);
  }

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    if (!this.isLoading) this.scheduleMapInitialization();
  }

  private scheduleMapInitialization(): void {
    setTimeout(() => {
      if (!this.map && this.viewInitialized && !this.isLoading) {
        this.initializeMap();
      }
    });
  }

  private async loadData(): Promise<void> {
    try {
      this.farms = await this.farmService.getFarms();
      if (this.farms.length > 0) {
        this.selectedFarmId = this.farms[0].id;
        await this.loadZones();
        await this.loadRisks();
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      this.isLoading = false;
      if (this.viewInitialized) this.scheduleMapInitialization();
    }
  }

  async onFarmChange(): Promise<void> {
    if (!this.selectedFarmId) return;
    await this.loadZones();
    this.selectedZoneId = undefined;
    this.satellite = null;
    this.satelliteError = null;
    await this.loadRisks();
    this.updateMap();
  }

  async onZoneChange(): Promise<void> {
    this.satellite = null;
    this.satelliteError = null;
    await this.loadRisks();
    this.updateMap();
  }

  async loadSatelliteSegmentation(): Promise<void> {
    const coordinates = this.getSelectedCoordinates();
    if (!coordinates) {
      this.satelliteError = 'No latitude/longitude is configured for the selected farm or zone.';
      return;
    }

    this.isSatelliteLoading = true;
    this.satelliteError = null;

    try {
      this.satellite = await this.satelliteProvider.getSegmentation(
        coordinates.latitude,
        coordinates.longitude,
      );
    } catch (error) {
      console.error('[Heatmap] Failed to load satellite segmentation:', error);
      this.satelliteError = error instanceof Error
        ? error.message
        : 'Failed to load satellite segmentation.';
    } finally {
      this.isSatelliteLoading = false;
    }
  }

  private getSelectedCoordinates(): {
  latitude: number;
  longitude: number;
} | null {

  // 1. Selected Zone
  if (this.selectedZoneId) {
    const zone = this.zones.find(
      (item) => item.id === this.selectedZoneId,
    );

    const latitude = Number(zone?.latitude);
    const longitude = Number(zone?.longitude);

    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
    ) {
      return {
        latitude,
        longitude,
      };
    }
  }

  // 2. Selected Farm
  if (this.selectedFarmId) {
    const farm = this.farms.find(
      (item) => item.id === this.selectedFarmId,
    );

    if (farm) {
      const latitude = Number(
        (farm as any).latitude,
      );

      const longitude = Number(
        (farm as any).longitude,
      );

      if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)
      ) {
        return {
          latitude,
          longitude,
        };
      }
    }
  }

  // 3. First Zone with valid coordinates
  const firstZone = this.zones.find((zone) => {
    const latitude = Number(zone.latitude);
    const longitude = Number(zone.longitude);

    return (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
    );
  });

  if (firstZone) {
    const latitude = Number(firstZone.latitude);
    const longitude = Number(firstZone.longitude);

    return {
      latitude,
      longitude,
    };
  }

  // 4. First Farm with valid coordinates
  const firstFarm = this.farms.find((farm) => {
    const latitude = Number(
      (farm as any).latitude,
    );

    const longitude = Number(
      (farm as any).longitude,
    );

    return (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
    );
  });

  if (firstFarm) {
    const latitude = Number(
      (firstFarm as any).latitude,
    );

    const longitude = Number(
      (firstFarm as any).longitude,
    );

    return {
      latitude,
      longitude,
    };
  }

  // No valid coordinates found
  return null;
}

  private async loadZones(): Promise<void> {
    if (!this.selectedFarmId) return;
    this.zones = await this.zoneService.getZonesByFarm(this.selectedFarmId);
  }

  private async loadRisks(): Promise<void> {
    if (!this.selectedFarmId) return;
    this.risks = await this.heatRiskService.getRisks(
      this.selectedFarmId,
      this.selectedZoneId,
    );
    this.zoneRisks = {};
    this.risks.forEach((risk) => {
      if (risk.zoneId) this.zoneRisks[risk.zoneId] = risk;
    });
  }

  private initializeMap(): void {
    const container = document.getElementById('heatmap-map');
    if (!container || this.map) return;

    this.map = L.map(container).setView([30, 31], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);
    this.updateMap();
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  private updateMap(): void {
    if (!this.map) return;
    this.markers.forEach((marker) => this.map?.removeLayer(marker));
    this.markers = [];

    const zonesToDisplay = this.selectedZoneId
      ? this.zones.filter((zone) => zone.id === this.selectedZoneId)
      : this.zones;

const map = this.map;

if (!map) {
  console.warn('[Heatmap] Cannot add zone markers: map is not initialized');
  return;
}

zonesToDisplay.forEach((zone) => {
  const latitude = Number(zone.latitude);
  const longitude = Number(zone.longitude);

  // Skip zones with invalid coordinates
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return;
  }

  const risk = this.zoneRisks[zone.id];

  const riskLevel =
    risk?.riskLevel ?? 'low';

  const color =
    this.getRiskColor(riskLevel);

  const radius =
    this.getRiskRadius(riskLevel);

  const marker = L.circleMarker(
    [latitude, longitude],
    {
      radius,
      fillColor: color,
      color,
      weight: 2,
      opacity: 0.8,
      fillOpacity: 0.5,
    },
  );

  marker.bindPopup(
    this.createPopupContent(
      zone,
      risk,
    ),
  );

  marker.addTo(map);

  this.markers.push(marker);
});

    if (this.markers.length > 0) {
      this.map.fitBounds(L.featureGroup(this.markers).getBounds().pad(0.1));
    }
  }

  private createPopupContent(zone: FarmZone, risk?: HeatRisk): string {
    const temperature = risk?.temperature ?? null;
    return `<div class="popup-content"><h3>${zone.name}</h3><p><strong>Risk Level:</strong> ${String(risk?.riskLevel || 'low').toUpperCase()}</p><p><strong>Risk Score:</strong> ${risk?.riskScore || 0}/100</p><p><strong>Temperature:</strong> ${temperature === null ? 'Not available' : `${temperature}°C`}</p></div>`;
  }

  private getRiskColor(riskLevel: string): string {
    return ({ low: '#2e7d32', moderate: '#f57c00', high: '#d32f2f', critical: '#b71c1c' } as Record<string, string>)[riskLevel] || '#757575';
  }

  private getRiskRadius(riskLevel: string): number {
    return ({ low: 15, moderate: 25, high: 35, critical: 50 } as Record<string, number>)[riskLevel] || 15;
  }

  getRiskStats(): { low: number; moderate: number; high: number; critical: number } {
    return {
      low: this.risks.filter((r) => r.riskLevel === 'low').length,
      moderate: this.risks.filter((r) => r.riskLevel === 'moderate').length,
      high: this.risks.filter((r) => r.riskLevel === 'high').length,
      critical: this.risks.filter((r) => r.riskLevel === 'critical').length,
    };
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = undefined;
  }
}
