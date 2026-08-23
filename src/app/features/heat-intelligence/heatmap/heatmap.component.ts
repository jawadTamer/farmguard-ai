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
    MatChipsModule
  ],
  templateUrl: './heatmap.component.html',
  styleUrl: './heatmap.component.css'
})
export class HeatmapComponent implements OnInit, AfterViewInit, OnDestroy {
  isLoading = true;
  farms: Farm[] = [];
  zones: FarmZone[] = [];

  selectedFarmId?: string;
  selectedZoneId?: string;

  risks: HeatRisk[] = [];
  zoneRisks: { [zoneId: string]: HeatRisk } = {};

  map?: L.Map;
  markers: L.CircleMarker[] = [];
  private viewInitialized = false;

  constructor(
    private farmService: FarmService,
    private zoneService: ZoneService,
    private heatRiskService: HeatRiskService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;

    // The map element is inside *ngIf="!isLoading", so it does not exist
    // during the first ngAfterViewInit call while data is still loading.
    if (!this.isLoading) {
      this.scheduleMapInitialization();
    }
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

      // Wait until Angular renders the !isLoading branch containing #heatmap-map.
      if (this.viewInitialized) {
        this.scheduleMapInitialization();
      }
    }
  }

  async onFarmChange(): Promise<void> {
    if (this.selectedFarmId) {
      await this.loadZones();
      this.selectedZoneId = undefined;
      await this.loadRisks();
      this.updateMap();
    }
  }

  async onZoneChange(): Promise<void> {
    await this.loadRisks();
    this.updateMap();
  }

  private async loadZones(): Promise<void> {
    if (this.selectedFarmId) {
      this.zones = await this.zoneService.getZonesByFarm(this.selectedFarmId);
      if (this.zones.length > 0) {
        this.selectedZoneId = this.zones[0].id;
      }
    }
  }

  private async loadRisks(): Promise<void> {
    const farmId = this.selectedFarmId;
    const zoneId = this.selectedZoneId;

    if (!farmId) return;

    this.risks = await this.heatRiskService.getRisks(farmId, zoneId);

    this.zoneRisks = {};
    this.risks.forEach(risk => {
      if (risk.zoneId) {
        this.zoneRisks[risk.zoneId] = risk;
      }
    });
  }

  private initializeMap(): void {
    const container = document.getElementById('heatmap-map');

    if (!container || this.map) {
      return;
    }

    this.map = L.map(container).setView([30.0, 31.0], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.updateMap();

    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  private updateMap(): void {
    if (!this.map) return;

    this.markers.forEach(marker => this.map!.removeLayer(marker));
    this.markers = [];

    const zonesToDisplay = this.selectedZoneId
      ? this.zones.filter(z => z.id === this.selectedZoneId)
      : this.zones;

    if (zonesToDisplay.length === 0) return;

    zonesToDisplay.forEach(zone => {
      if (zone.latitude == null || zone.longitude == null) return;

      const risk = this.zoneRisks[zone.id];
      const riskLevel = risk?.riskLevel || 'low';
      const color = this.getRiskColor(riskLevel);
      const radius = this.getRiskRadius(riskLevel);

      const marker = L.circleMarker([zone.latitude, zone.longitude], {
        radius,
        fillColor: color,
        color,
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.5
      });

      marker.bindPopup(this.createPopupContent(zone, risk));
      marker.addTo(this.map!);
      this.markers.push(marker);
    });

    if (this.markers.length > 0) {
      const group = L.featureGroup(this.markers);
      this.map.fitBounds(group.getBounds().pad(0.1));
    }
  }

  private createPopupContent(zone: FarmZone, risk?: HeatRisk): string {
    const riskLevel = risk?.riskLevel || 'low';
    const riskScore = risk?.riskScore || 0;
    const temperature = risk?.temperature ?? null;

    return `
      <div class="popup-content">
        <h3>${zone.name}</h3>
        <p><strong>Risk Level:</strong> <span style="color: ${this.getRiskColor(riskLevel)}">${riskLevel.toUpperCase()}</span></p>
        <p><strong>Risk Score:</strong> ${riskScore}/100</p>
        <p><strong>Temperature:</strong> ${temperature === null ? 'Not available' : `${temperature}°C`}</p>
        ${risk?.reason ? `<p><strong>Reason:</strong> ${risk.reason}</p>` : ''}
      </div>
    `;
  }

  private getRiskColor(riskLevel: string): string {
    const colors = {
      low: '#2e7d32',
      moderate: '#f57c00',
      high: '#d32f2f',
      critical: '#b71c1c'
    };
    return colors[riskLevel as keyof typeof colors] || '#757575';
  }

  private getRiskRadius(riskLevel: string): number {
    const radii = {
      low: 15,
      moderate: 25,
      high: 35,
      critical: 50
    };
    return radii[riskLevel as keyof typeof radii] || 15;
  }

  getRiskStats(): { low: number; moderate: number; high: number; critical: number } {
    return {
      low: this.risks.filter(r => r.riskLevel === 'low').length,
      moderate: this.risks.filter(r => r.riskLevel === 'moderate').length,
      high: this.risks.filter(r => r.riskLevel === 'high').length,
      critical: this.risks.filter(r => r.riskLevel === 'critical').length
    };
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = undefined;
  }
}