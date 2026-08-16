import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';

import { ZoneService } from '../../../core/services/zone.service';
import { FarmService } from '../../../core/services/farm.service';

import { FarmZone } from '../../../core/models/farm-zone.model';
import { Farm } from '../../../core/models/farm.model';

@Component({
  selector: 'app-zone-details',
  standalone: true,

  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule
  ],

  templateUrl: './zone-details.component.html',
  styleUrl: './zone-details.component.css'
})
export class ZoneDetailsComponent implements OnInit {

  farmId = '';

  zoneId = '';

  farm?: Farm;

  zone?: FarmZone;

  isLoading = true;

  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private zoneService: ZoneService,
    private farmService: FarmService
  ) {}

  // =====================================================
  // Init
  // =====================================================

  ngOnInit(): void {

    const farmId =
      this.route.snapshot.paramMap.get('farmId');

    const zoneId =
      this.route.snapshot.paramMap.get('zoneId');

    if (!farmId || !zoneId) {

      this.errorMessage =
        'Zone information is missing.';

      this.isLoading = false;

      return;
    }

    this.farmId = farmId;
    this.zoneId = zoneId;

    this.loadData();

  }

  // =====================================================
  // Load
  // =====================================================

  async loadData(): Promise<void> {

    this.isLoading = true;
    this.errorMessage = '';

    try {

      const [farm, zone] =
        await Promise.all([

          this.farmService.getFarmById(
            this.farmId
          ),

          this.zoneService.getZoneById(
            this.zoneId
          )

        ]);

      this.farm = farm;
      this.zone = zone;

      if (!this.zone) {

        this.errorMessage =
          'Zone not found.';

      }

    } catch (error) {

      console.error(
        'Failed to load zone:',
        error
      );

      this.errorMessage =
        'Unable to load zone information.';

    } finally {

      this.isLoading = false;

    }

  }

  // =====================================================
  // Navigation
  // =====================================================

  goBack(): void {

    this.router.navigate([
      '/farms',
      this.farmId,
      'zones'
    ]);

  }

  editZone(): void {

    this.router.navigate([
      '/farms',
      this.farmId,
      'zones',
      this.zoneId,
      'edit'
    ]);

  }

  // =====================================================
  // Delete
  // =====================================================

  async deleteZone(): Promise<void> {

    if (!this.zone) {
      return;
    }

    const confirmed =
      window.confirm(
        `Are you sure you want to delete "${this.zone.name}"?`
      );

    if (!confirmed) {
      return;
    }

    try {

      await this.zoneService.deleteZone(
        this.zone.id
      );

      await this.router.navigate([
        '/farms',
        this.farmId,
        'zones'
      ]);

    } catch (error) {

      console.error(
        'Failed to delete zone:',
        error
      );

      this.errorMessage =
        'Failed to delete the zone.';

    }

  }

  // =====================================================
  // Helpers
  // =====================================================

  hasLocation(): boolean {

    return !!this.zone &&
      this.zone.latitude !== undefined &&
      this.zone.longitude !== undefined;

  }

  getCoordinates(): string {

    if (!this.zone) {
      return 'Not available';
    }

    if (
      this.zone.latitude === undefined ||
      this.zone.longitude === undefined
    ) {
      return 'Not available';
    }

    return `${this.zone.latitude}, ${this.zone.longitude}`;

  }

}