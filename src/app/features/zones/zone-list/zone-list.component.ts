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
import Swal from 'sweetalert2';

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

  farms: Farm[] = [];

  zones: FarmZone[] = [];

  groupedZones: Array<{ farm: Farm; zones: FarmZone[] }> = [];

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
    const id = this.route.snapshot.paramMap.get('farmId');

    if (id) {
      this.farmId = id;
      void this.loadFarmAndZones();
      return;
    }

    void this.loadAllZones();
  }

  async loadFarmAndZones(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const [farm, zones] = await Promise.all([
        this.farmService.getFarmById(this.farmId),
        this.zoneService.getZonesByFarm(this.farmId),
      ]);

      this.farm = farm;
      this.zones = zones;
      this.farms = farm ? [farm] : [];
      this.groupedZones = farm ? [{ farm, zones }] : [];
    } catch (error) {
      console.error('Failed to load farm zones:', error);
      this.errorMessage =
        'Unable to load zones for this farm. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  async loadAllZones(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const [farms, zones] = await Promise.all([
        this.farmService.getFarms(),
        this.zoneService.getAllZones(),
      ]);

      this.farms = farms;
      this.zones = zones;
      this.groupedZones = farms.map((farm) => ({
        farm,
        zones: zones.filter((zone) => zone.farmId === farm.id),
      }));
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
    const result = await Swal.fire({
      title: 'Delete zone?',
      text: `"${zone.name}" will be permanently deleted.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#d32f2f',
      reverseButtons: true,
    });

    if (!result.isConfirmed) {
      return;
    }

    this.deletingZoneId = zone.id;

    try {
      await this.zoneService.deleteZone(zone.id);

      this.zones = this.zones.filter((item) => item.id !== zone.id);

      if (this.farmId) {
        this.groupedZones = [{ farm: this.farm!, zones: this.zones }];
      } else {
        this.groupedZones = this.farms.map((farm) => ({
          farm,
          zones: this.zones.filter((item) => item.farmId === farm.id),
        }));
      }
    } catch (error) {
      console.error('Failed to delete zone:', error);

      this.errorMessage = 'Failed to delete the zone. Please try again.';

      await Swal.fire({
        title: 'Delete failed',
        text: 'Unable to delete this zone. Please try again.',
        icon: 'error',
      });
    } finally {
      this.deletingZoneId = null;
    }
  }

  // =====================================================
  // Navigation
  // =====================================================

  goBack(): void {
    if (this.farmId) {
      this.router.navigate(['/farms', this.farmId]);
      return;
    }

    this.router.navigate(['/farms']);
  }

  createZone(): void {
    if (this.farmId) {
      this.router.navigate(['/farms', this.farmId, 'zones', 'create']);
      return;
    }

    this.router.navigate(['/zones', 'create']);
  }

  viewZone(zoneId: string): void {
    if (this.farmId) {
      this.router.navigate(['/farms', this.farmId, 'zones', zoneId]);
      return;
    }

    this.router.navigate(['/zones', zoneId]);
  }

  editZone(zoneId: string): void {
    if (this.farmId) {
      this.router.navigate(['/farms', this.farmId, 'zones', zoneId, 'edit']);
      return;
    }

    this.router.navigate(['/zones', zoneId, 'edit']);
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
