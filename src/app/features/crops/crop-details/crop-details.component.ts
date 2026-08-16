import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import Swal from 'sweetalert2';

import { CropService } from '../../../core/services/crop.service';
import { ZoneService } from '../../../core/services/zone.service';
import { Crop } from '../../../core/models/crop.model';
import { FarmZone } from '../../../core/models/farm-zone.model';

@Component({
  selector: 'app-crop-details',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatChipsModule,
  ],
  templateUrl: './crop-details.component.html',
  styleUrl: './crop-details.component.css',
})
export class CropDetailsComponent implements OnInit {
  cropId = '';
  crop?: Crop;
  zone?: FarmZone;
  isLoading = true;
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cropService: CropService,
    private zoneService: ZoneService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.errorMessage = 'Crop information is missing.';
      this.isLoading = false;
      return;
    }
    this.cropId = id;
    void this.loadData();
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const crop = await this.cropService.getCropById(this.cropId);
      this.crop = crop;

      if (!this.crop) {
        this.errorMessage = 'Crop not found.';
        this.isLoading = false;
        return;
      }

      if (this.crop.zoneId) {
        this.zone = await this.zoneService.getZoneById(this.crop.zoneId);
      }
    } catch (error) {
      console.error('Failed to load crop:', error);
      this.errorMessage = 'Unable to load crop information.';
    } finally {
      this.isLoading = false;
    }
  }

  goBack(): void {
    this.router.navigate(['/crops']);
  }

  editCrop(): void {
    this.router.navigate(['/crops', this.cropId, 'edit']);
  }

  async deleteCrop(): Promise<void> {
    if (!this.crop) {
      return;
    }

    const result = await Swal.fire({
      title: 'Delete crop?',
      text: `"${this.crop.cropType}" will be permanently deleted.`,
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
      await this.cropService.deleteCrop(this.cropId);

      await Swal.fire({
        title: 'Deleted',
        text: 'Crop deleted successfully.',
        icon: 'success',
        timer: 1800,
        showConfirmButton: false,
      });

      await this.router.navigate(['/crops']);
    } catch (error) {
      console.error('Failed to delete crop:', error);
      this.errorMessage = 'Failed to delete the crop.';

      await Swal.fire({
        title: 'Delete failed',
        text: 'Unable to delete this crop. Please try again.',
        icon: 'error',
      });
    }
  }

  getCreatedDate(): string {
    if (!this.crop?.createdAt) {
      return 'Not available';
    }
    return new Date(this.crop.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  getPlantingDate(): string {
    if (!this.crop?.plantingDate) {
      return 'Not specified';
    }
    return new Date(this.crop.plantingDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
