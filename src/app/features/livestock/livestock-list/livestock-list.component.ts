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

import { LivestockService } from '../../../core/services/livestock.service';
import { ZoneService } from '../../../core/services/zone.service';
import { Livestock } from '../../../core/models/livestock.model';
import { FarmZone } from '../../../core/models/farm-zone.model';

interface LivestockGroup {
  zoneId: string;
  zoneName: string;
  livestock: Livestock[];
}

@Component({
  selector: 'app-livestock-list',
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
  templateUrl: './livestock-list.component.html',
  styleUrl: './livestock-list.component.css',
})
export class LivestockListComponent implements OnInit {
  livestock: Livestock[] = [];
  groupedLivestock: LivestockGroup[] = [];
  zones: FarmZone[] = [];
  isLoading = true;
  errorMessage = '';
  deletingLivestockId: string | null = null;

  constructor(
    private livestockService: LivestockService,
    private zoneService: ZoneService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    void this.loadLivestock();
  }

  async loadLivestock(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const [livestock, zones] = await Promise.all([
        this.livestockService.getAllLivestock(),
        this.zoneService.getAllZones(),
      ]);

      this.livestock = livestock;
      this.zones = zones;
      this.groupedLivestock = this.buildLivestockGroups(livestock, zones);
    } catch (error) {
      console.error('Failed to load livestock:', error);
      this.errorMessage = 'Unable to load livestock records. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  private buildLivestockGroups(
    items: Livestock[],
    zones: FarmZone[],
  ): LivestockGroup[] {
    const zoneMap = new Map(zones.map((zone) => [zone.id, zone.name]));
    const groups = new Map<string, LivestockGroup>();

    for (const item of items) {
      const zoneId = item.zoneId || 'unassigned';
      const existing = groups.get(zoneId);

      if (existing) {
        existing.livestock.push(item);
        continue;
      }

      groups.set(zoneId, {
        zoneId,
        zoneName: zoneMap.get(zoneId) || 'Unknown Zone',
        livestock: [item],
      });
    }

    return Array.from(groups.values()).sort((a, b) =>
      a.zoneName.localeCompare(b.zoneName),
    );
  }

  async deleteLivestock(item: Livestock): Promise<void> {
    const result = await Swal.fire({
      title: 'Delete livestock?',
      text: `"${item.livestockType}" will be permanently removed.`,
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

    this.deletingLivestockId = item.id;

    try {
      await this.livestockService.deleteLivestock(item.id);
      this.livestock = this.livestock.filter((entry) => entry.id !== item.id);
      this.groupedLivestock = this.buildLivestockGroups(
        this.livestock,
        this.zones,
      );
    } catch (error) {
      console.error('Failed to delete livestock:', error);
      this.errorMessage =
        'Failed to delete the livestock record. Please try again.';
      await Swal.fire({
        title: 'Delete failed',
        text: 'Unable to delete this livestock record. Please try again.',
        icon: 'error',
      });
    } finally {
      this.deletingLivestockId = null;
    }
  }

  createLivestock(): void {
    this.router.navigate(['/livestock', 'create']);
  }

  viewLivestock(id: string): void {
    this.router.navigate(['/livestock', id]);
  }

  editLivestock(id: string): void {
    this.router.navigate(['/livestock', id, 'edit']);
  }

  getStatusLabel(status?: string): string {
    if (!status) {
      return 'Healthy';
    }

    return status.charAt(0).toUpperCase() + status.slice(1);
  }
}
