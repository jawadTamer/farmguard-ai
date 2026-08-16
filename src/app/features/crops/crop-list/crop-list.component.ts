import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import Swal from 'sweetalert2';

import { CropService } from '../../../core/services/crop.service';
import { ZoneService } from '../../../core/services/zone.service';
import { Crop } from '../../../core/models/crop.model';
import { FarmZone } from '../../../core/models/farm-zone.model';

interface CropGroup {
  zoneId: string;
  zoneName: string;
  crops: Crop[];
}

@Component({
  selector: 'app-crop-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  templateUrl: './crop-list.component.html',
  styleUrl: './crop-list.component.css',
})
export class CropListComponent implements OnInit {
  crops: Crop[] = [];
  groupedCrops: CropGroup[] = [];
  zones: FarmZone[] = [];
  isLoading = true;
  errorMessage = '';
  deletingCropId: string | null = null;

  constructor(
    private cropService: CropService,
    private zoneService: ZoneService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    void this.loadCrops();
  }

  async loadCrops(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const [crops, zones] = await Promise.all([
        this.cropService.getAllCrops(),
        this.zoneService.getAllZones(),
      ]);

      this.crops = crops;
      this.zones = zones;
      this.groupedCrops = this.buildCropGroups(crops, zones);
    } catch (error) {
      console.error('Failed to load crops:', error);
      this.errorMessage = 'Unable to load crop records. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  private buildCropGroups(crops: Crop[], zones: FarmZone[]): CropGroup[] {
    const zoneMap = new Map(zones.map((zone) => [zone.id, zone.name]));
    const groups = new Map<string, CropGroup>();

    for (const crop of crops) {
      const zoneId = crop.zoneId || 'unassigned';
      const existing = groups.get(zoneId);

      if (existing) {
        existing.crops.push(crop);
        continue;
      }

      groups.set(zoneId, {
        zoneId,
        zoneName: zoneMap.get(zoneId) || 'Unknown Zone',
        crops: [crop],
      });
    }

    return Array.from(groups.values()).sort((a, b) =>
      a.zoneName.localeCompare(b.zoneName),
    );
  }

  async deleteCrop(crop: Crop): Promise<void> {
    const result = await Swal.fire({
      title: 'Delete crop?',
      text: `"${crop.cropType}" will be permanently removed.`,
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

    this.deletingCropId = crop.id;

    try {
      await this.cropService.deleteCrop(crop.id);
      this.crops = this.crops.filter((item) => item.id !== crop.id);
      this.groupedCrops = this.buildCropGroups(this.crops, this.zones);
    } catch (error) {
      console.error('Failed to delete crop:', error);
      this.errorMessage = 'Failed to delete the crop. Please try again.';
      await Swal.fire({
        title: 'Delete failed',
        text: 'Unable to delete this crop. Please try again.',
        icon: 'error',
      });
    } finally {
      this.deletingCropId = null;
    }
  }

  createCrop(): void {
    this.router.navigate(['/crops', 'create']);
  }

  viewCrop(cropId: string): void {
    this.router.navigate(['/crops', cropId]);
  }

  editCrop(cropId: string): void {
    this.router.navigate(['/crops', cropId, 'edit']);
  }

  getGrowthStageLabel(stage: string): string {
    if (!stage) {
      return 'Unknown';
    }

    return stage.charAt(0).toUpperCase() + stage.slice(1);
  }

  formatDate(date?: string): string {
    if (!date) {
      return 'Not set';
    }

    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
