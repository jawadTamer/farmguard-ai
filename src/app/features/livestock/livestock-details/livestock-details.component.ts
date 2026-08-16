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

import { LivestockService } from '../../../core/services/livestock.service';
import { ZoneService } from '../../../core/services/zone.service';
import { Livestock } from '../../../core/models/livestock.model';
import { FarmZone } from '../../../core/models/farm-zone.model';

@Component({
  selector: 'app-livestock-details',
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
  templateUrl: './livestock-details.component.html',
  styleUrl: './livestock-details.component.css',
})
export class LivestockDetailsComponent implements OnInit {
  livestockId = '';
  livestock?: Livestock;
  zone?: FarmZone;
  isLoading = true;
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private livestockService: LivestockService,
    private zoneService: ZoneService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.errorMessage = 'Livestock information is missing.';
      this.isLoading = false;
      return;
    }
    this.livestockId = id;
    void this.loadData();
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const livestock = await this.livestockService.getLivestockById(
        this.livestockId,
      );
      this.livestock = livestock;

      if (!this.livestock) {
        this.errorMessage = 'Livestock not found.';
        this.isLoading = false;
        return;
      }

      if (this.livestock.zoneId) {
        this.zone = await this.zoneService.getZoneById(this.livestock.zoneId);
      }
    } catch (error) {
      console.error('Failed to load livestock:', error);
      this.errorMessage = 'Unable to load livestock information.';
    } finally {
      this.isLoading = false;
    }
  }

  goBack(): void {
    this.router.navigate(['/livestock']);
  }

  editLivestock(): void {
    this.router.navigate(['/livestock', this.livestockId, 'edit']);
  }

  async deleteLivestock(): Promise<void> {
    if (!this.livestock) {
      return;
    }

    const result = await Swal.fire({
      title: 'Delete livestock?',
      text: `"${this.livestock.livestockType}" will be permanently deleted.`,
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
      await this.livestockService.deleteLivestock(this.livestockId);

      await Swal.fire({
        title: 'Deleted',
        text: 'Livestock deleted successfully.',
        icon: 'success',
        timer: 1800,
        showConfirmButton: false,
      });

      await this.router.navigate(['/livestock']);
    } catch (error) {
      console.error('Failed to delete livestock:', error);
      this.errorMessage = 'Failed to delete the livestock.';

      await Swal.fire({
        title: 'Delete failed',
        text: 'Unable to delete this livestock. Please try again.',
        icon: 'error',
      });
    }
  }

  getCreatedDate(): string {
    if (!this.livestock?.createdAt) {
      return 'Not available';
    }
    return new Date(this.livestock.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
