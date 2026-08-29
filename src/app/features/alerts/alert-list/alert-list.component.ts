import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';

import { AlertService } from '../../../core/services/alert.service';
import { FarmAlert, AlertSeverity } from '../../../core/models/alert.model';

@Component({
  selector: 'app-alert-list',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  templateUrl: './alert-list.component.html',
  styleUrl: './alert-list.component.css'
})
export class AlertListComponent implements OnInit {
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);

  alerts: FarmAlert[] = [];
  isLoading = true;
  errorMessage = '';

  ngOnInit(): void {
    this.loadAlerts();
  }

  async loadAlerts(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.alerts = await this.alertService.getAlerts();
    } catch (error) {
      console.error('Failed to load alerts:', error);
      this.errorMessage = 'Failed to load alerts. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  async markAsRead(id: string): Promise<void> {
    await this.alertService.markAsRead(id);
    await this.loadAlerts();
  }

  async markAllAsRead(): Promise<void> {
    await this.alertService.markAllAsRead();
    await this.loadAlerts();
  }

  getSeverityColor(severity: AlertSeverity): string {
    switch (severity) {
      case 'critical': return 'warn';
      case 'warning': return 'accent';
      case 'info': return 'primary';
      default: return 'primary';
    }
  }

  getSeverityIcon(severity: AlertSeverity): string {
    switch (severity) {
      case 'critical': return 'warning';
      case 'warning': return 'error_outline';
      case 'info': return 'info';
      default: return 'info';
    }
  }

  getTypeIcon(type: string): string {
    if (type === 'heat-stress') return 'local_fire_department';
    if (type === 'temperature') return 'thermostat';
    return 'notifications';
  }

  formatTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  }

  navigateToAlert(alert: FarmAlert): void {
    if (alert.zoneId) {
      this.router.navigate(['/zones', alert.zoneId]);
    } else if (alert.farmId) {
      this.router.navigate(['/farms', alert.farmId]);
    }
  }
}
