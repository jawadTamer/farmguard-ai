import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';

import { FarmService } from '../../../core/services/farm.service';
import { Farm } from '../../../core/models/farm.model';
import { LocationDisplayComponent } from '../../../shared/components/location-display/location-display.component';

@Component({
  selector: 'app-farm-details',
  standalone: true,

  imports: [
    CommonModule,
    RouterLink,

    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    LocationDisplayComponent,
  ],

  templateUrl: './farm-details.component.html',
  styleUrl: './farm-details.component.css',
})
export class FarmDetailsComponent implements OnInit {
  // =====================================================
  // Farm
  // =====================================================

  farm: Farm | undefined;

  isLoading = true;

  notFound = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private farmService: FarmService,
  ) {}

  // =====================================================
  // Lifecycle
  // =====================================================

  ngOnInit(): void {
    void this.loadFarm();
  }

  // =====================================================
  // Load Farm
  // =====================================================

  private async loadFarm(): Promise<void> {
    const farmId = this.route.snapshot.paramMap.get('id');

    if (!farmId) {
      this.notFound = true;

      this.isLoading = false;

      return;
    }

    const farm = await this.farmService.getFarmById(farmId);

    if (!farm) {
      this.notFound = true;

      this.isLoading = false;

      return;
    }

    this.farm = farm;

    this.isLoading = false;
  }

  // =====================================================
  // Edit
  // =====================================================

  editFarm(): void {
    if (!this.farm) {
      return;
    }

    this.router.navigate(['/farms', this.farm.id, 'edit']);
  }

  // =====================================================
  // Back
  // =====================================================

  goBack(): void {
    this.router.navigate(['/farms']);
  }

  // =====================================================
  // Status
  // =====================================================

  getStatusClass(): string {
    return this.farm?.status === 'active' ? 'status-active' : 'status-inactive';
  }

  getStatusLabel(): string {
    return this.farm?.status === 'active' ? 'Active' : 'Inactive';
  }

  // =====================================================
  // Coordinates
  // =====================================================

  hasCoordinates(): boolean {
    return (
      this.farm?.latitude !== undefined && this.farm?.longitude !== undefined
    );
  }

  // =====================================================
  // Created Date
  // =====================================================

  getCreatedDate(): string {
    if (!this.farm?.createdAt) {
      return 'Not available';
    }

    return new Date(this.farm.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  // =====================================================
  // Updated Date
  // =====================================================

  getUpdatedDate(): string {
    if (!this.farm?.updatedAt) {
      return 'Not available';
    }

    return new Date(this.farm.updatedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
