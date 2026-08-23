import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import Swal from 'sweetalert2';

import { ZoneService } from '../../../core/services/zone.service';
import { FarmService } from '../../../core/services/farm.service';

import { FarmZone } from '../../../core/models/farm-zone.model';
import { Farm } from '../../../core/models/farm.model';
import { LocationDisplayComponent } from '../../../shared/components/location-display/location-display.component';

@Component({
  selector: 'app-zone-details',
  standalone: true,

  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    LocationDisplayComponent,
  ],

  templateUrl: './zone-details.component.html',
  styleUrl: './zone-details.component.css',
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
    private farmService: FarmService,
  ) { }

  // =====================================================
  // Init
  // =====================================================

  ngOnInit(): void {
    const farmId = this.route.snapshot.paramMap.get('farmId');

    const zoneId = this.route.snapshot.paramMap.get('zoneId');

    if (!zoneId) {
      this.errorMessage = 'Zone information is missing.';

      this.isLoading = false;

      return;
    }

    this.zoneId = zoneId;

    if (farmId) {
      this.farmId = farmId;
    }

    void this.loadData();
  }

  // =====================================================
  // Load
  // =====================================================

  async loadData(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const zone = await this.zoneService.getZoneById(this.zoneId);

      this.zone = zone;

      if (!this.zone) {
        this.errorMessage = 'Zone not found.';

        this.isLoading = false;
        return;
      }

      if (!this.farmId && this.zone.farmId) {
        this.farmId = this.zone.farmId;
      }

      this.farm = this.farmId
        ? await this.farmService.getFarmById(this.farmId)
        : undefined;
    } catch (error) {
      console.error('Failed to load zone:', error);

      this.errorMessage = 'Unable to load zone information.';
    } finally {
      this.isLoading = false;
    }
  }

  // =====================================================
  // Navigation
  // =====================================================

  goBack(): void {
    if (this.farmId) {
      this.router.navigate(['/farms', this.farmId, 'zones']);
      return;
    }

    this.router.navigate(['/zones']);
  }

  editZone(): void {
    if (this.farmId) {
      this.router.navigate([
        '/farms',
        this.farmId,
        'zones',
        this.zoneId,
        'edit',
      ]);
      return;
    }

    this.router.navigate(['/zones', this.zoneId, 'edit']);
  }

  // =====================================================
  // Delete
  // =====================================================

  async deleteZone(): Promise<void> {
    if (!this.zone) {
      return;
    }

    const result = await Swal.fire({
      title: 'Delete zone?',
      text: `"${this.zone.name}" will be permanently deleted.`,
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

    try {
      await this.zoneService.deleteZone(this.zone.id);

      await Swal.fire({
        title: 'Deleted',
        text: 'Zone deleted successfully.',
        icon: 'success',
        timer: 1800,
        showConfirmButton: false,
      });

      await this.router.navigate(['/farms', this.farmId, 'zones']);
    } catch (error) {
      console.error('Failed to delete zone:', error);

      this.errorMessage = 'Failed to delete the zone.';

      await Swal.fire({
        title: 'Delete failed',
        text: 'Unable to delete this zone. Please try again.',
        icon: 'error',
      });
    }
  }

  // =====================================================
  // Helpers
  // =====================================================

  hasLocation(): boolean {
    return (
      !!this.zone &&
      this.zone.latitude !== undefined &&
      this.zone.longitude !== undefined
    );
  }

  getCoordinates(): string {
    if (!this.zone) {
      return 'Not available';
    }

    if (this.zone.latitude === undefined || this.zone.longitude === undefined) {
      return 'Not available';
    }

    return `${this.zone.latitude}, ${this.zone.longitude}`;
  }
}
