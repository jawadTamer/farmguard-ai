import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';

import { FarmService } from '../../../core/services/farm.service';
import { ZoneService } from '../../../core/services/zone.service';
import { HeatRiskService } from '../../../core/services/heat-risk.service';

import { Farm } from '../../../core/models/farm.model';
import { FarmZone } from '../../../core/models/farm-zone.model';
import { HeatRisk } from '../../../core/models/heat-risk.model';

@Component({
  selector: 'app-risk-analysis',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTableModule,
    MatChipsModule
  ],
  templateUrl: './risk-analysis.component.html',
  styleUrl: './risk-analysis.component.css'
})
export class RiskAnalysisComponent implements OnInit {
  isLoading = true;
  farms: Farm[] = [];
  zones: FarmZone[] = [];

  selectedFarmId?: string;
  selectedZoneId?: string;
  selectedRiskLevel?: string;

  risks: HeatRisk[] = [];
  filteredRisks: HeatRisk[] = [];

  displayedColumns: string[] = ['zone', 'temperature', 'riskLevel', 'riskScore', 'reason', 'detectedAt'];

  constructor(
    private farmService: FarmService,
    private zoneService: ZoneService,
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
        await this.loadRisks();
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
      await this.loadRisks();
    }
  }

  async onZoneChange(): Promise<void> {
    await this.loadRisks();
  }

  onRiskLevelChange(): void {
    this.applyFilters();
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
    this.applyFilters();
  }

  private applyFilters(): void {
    this.filteredRisks = this.risks.filter(risk => {
      if (this.selectedRiskLevel && risk.riskLevel !== this.selectedRiskLevel) {
        return false;
      }
      return true;
    });
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

  getRiskScoreColor(score: number): string {
    if (score >= 75) return '#b71c1c';
    if (score >= 50) return '#d32f2f';
    if (score >= 25) return '#f57c00';
    return '#2e7d32';
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }

  getZoneName(zoneId: string): string {
    const zone = this.zones.find(z => z.id === zoneId);
    return zone?.name || 'Unknown Zone';
  }

  getRiskStats(): { total: number; high: number; critical: number } {
    return {
      total: this.filteredRisks.length,
      high: this.filteredRisks.filter(r => r.riskLevel === 'high').length,
      critical: this.filteredRisks.filter(r => r.riskLevel === 'critical').length
    };
  }
}
