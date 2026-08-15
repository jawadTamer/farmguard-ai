import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { FormsModule } from '@angular/forms';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';

import { FarmService } from '../../../core/services/farm.service';
import { Farm } from '../../../core/models/farm.model';

@Component({
  selector: 'app-farm-list',
  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    RouterLink,

    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatChipsModule,
    MatTooltipModule,
  ],

  templateUrl: './farm-list.component.html',
  styleUrl: './farm-list.component.css',
})
export class FarmListComponent implements OnInit {
  // =====================================================
  // Data
  // =====================================================

  farms: Farm[] = [];

  filteredFarms: Farm[] = [];

  // =====================================================
  // UI State
  // =====================================================

  searchTerm = '';

  selectedStatus: 'all' | 'active' | 'inactive' = 'all';

  isLoading = false;

  // =====================================================
  // Constructor
  // =====================================================

  constructor(
    private farmService: FarmService,
    private router: Router,
  ) {}

  // =====================================================
  // Lifecycle
  // =====================================================

  ngOnInit(): void {
    this.loadFarms();
  }

  // =====================================================
  // Load Farms
  // =====================================================

  loadFarms(): void {
    this.isLoading = true;

    try {
      this.farms = this.farmService.getFarms();

      this.applyFilters();
    } finally {
      this.isLoading = false;
    }
  }

  // =====================================================
  // Search
  // =====================================================

  onSearchChange(): void {
    this.applyFilters();
  }

  // =====================================================
  // Status Filter
  // =====================================================

  setStatus(status: 'all' | 'active' | 'inactive'): void {
    this.selectedStatus = status;

    this.applyFilters();
  }

  // =====================================================
  // Apply Filters
  // =====================================================

  private applyFilters(): void {
    const search = this.searchTerm.trim().toLowerCase();

    this.filteredFarms = this.farms.filter((farm) => {
      const matchesSearch =
        !search ||
        farm.name.toLowerCase().includes(search) ||
        farm.location.toLowerCase().includes(search);

      const matchesStatus =
        this.selectedStatus === 'all' || farm.status === this.selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }

  // =====================================================
  // Navigation
  // =====================================================

  viewFarm(farmId: string): void {
    this.router.navigate(['/farms', farmId]);
  }

  editFarm(farmId: string): void {
    this.router.navigate(['/farms', 'edit', farmId]);
  }

  createFarm(): void {
    this.router.navigate(['/farms', 'create']);
  }

  // =====================================================
  // Delete
  // =====================================================

  deleteFarm(farm: Farm): void {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${farm.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    /*
     * Delete will be connected to Supabase later.
     *
     * For now we remove the farm locally so the UI
     * behaves correctly while the backend is not ready.
     */

    this.farms = this.farms.filter((item) => item.id !== farm.id);

    this.applyFilters();
  }

  // =====================================================
  // Helpers
  // =====================================================

  getStatusClass(status: string): string {
    return status === 'active' ? 'status-active' : 'status-inactive';
  }

  getStatusLabel(status: string): string {
    return status === 'active' ? 'Active' : 'Inactive';
  }

  trackByFarmId(index: number, farm: Farm): string {
    return farm.id;
  }
}
