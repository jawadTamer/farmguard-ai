import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';

import { ZoneService } from '../../../core/services/zone.service';
import { FarmService } from '../../../core/services/farm.service';
import { FarmZone } from '../../../core/models/farm-zone.model';
import { Farm } from '../../../core/models/farm.model';

@Component({
  selector: 'app-zone-list',
  standalone: true,

  imports: [
    CommonModule,
    RouterLink,

    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDividerModule,
  ],

  templateUrl: './zone-list.component.html',
  styleUrl: './zone-list.component.css',
})
export class ZoneListComponent implements OnInit {
  farmId = '';

  farm?: Farm;

  zones: FarmZone[] = [];

  isLoading = true;

  errorMessage = '';

  deletingZoneId: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private zoneService: ZoneService,
    private farmService: FarmService,
  ) {}

  // =====================================================
  // Init
  // =====================================================

  ngOnInit(): void {
    const id =
      this.route.snapshot.paramMap.get('farmId') ??
      this.route.snapshot.queryParamMap.get('farmId');

    if (id) {
      this.farmId = id;
      this.loadFarm();
      this.loadZones();
      return;
    }

    void this.loadFirstFarmAndZones();
  }

  async loadFirstFarmAndZones(): Promise<void> {
    try {
      const farms = await this.farmService.getFarms();

      if (!farms.length) {
        this.errorMessage = 'No farms are available yet.';
        this.isLoading = false;
        return;
      }

      this.farmId = farms[0].id;
      this.farm = farms[0];
      await this.loadZones();
    } catch (error) {
      console.error('Failed to load default farm for zones:', error);

      this.errorMessage = 'Unable to load the default farm. Please try again.';
      this.isLoading = false;
    }
  }

  // =====================================================
  // Load Farm
  // =====================================================

  async loadFarm(): Promise<void> {
    try {
      this.farm = await this.farmService.getFarmById(this.farmId);
    } catch (error) {
      console.error('Failed to load farm:', error);
    }
  }

  // =====================================================
  // Load Zones
  // =====================================================

  async loadZones(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      this.zones = await this.zoneService.getZonesByFarm(this.farmId);
    } catch (error) {
      console.error('Failed to load zones:', error);

      this.errorMessage = 'Unable to load zones. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  // =====================================================
  // Delete
  // =====================================================

  async deleteZone(zone: FarmZone): Promise<void> {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${zone.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    this.deletingZoneId = zone.id;

    try {
      await this.zoneService.deleteZone(zone.id);

      this.zones = this.zones.filter((item) => item.id !== zone.id);
    } catch (error) {
      console.error('Failed to delete zone:', error);

      this.errorMessage = 'Failed to delete the zone. Please try again.';
    } finally {
      this.deletingZoneId = null;
    }
  }

  // =====================================================
  // Navigation
  // =====================================================

  goBack(): void {
    this.router.navigate(['/farms', this.farmId]);
  }

  createZone(): void {
    this.router.navigate(['/farms', this.farmId, 'zones', 'create']);
  }

  viewZone(zoneId: string): void {
    this.router.navigate(['/farms', this.farmId, 'zones', zoneId]);
  }

  editZone(zoneId: string): void {
    this.router.navigate(['/farms', this.farmId, 'zones', zoneId, 'edit']);
  }

  // =====================================================
  // Helpers
  // =====================================================

  getZoneArea(zone: FarmZone): string {
    if (zone.area === undefined || zone.area === null) {
      return '—';
    }

    return `${zone.area} acres`;
  }
}
