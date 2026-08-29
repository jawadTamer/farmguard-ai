import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';

import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';

import { SidebarComponent } from '../sidebar/sidebar.component';
import { AuthService } from '../../core/auth/auth.service';
import { AlertService } from '../../core/services/alert.service';
import { FarmAlert } from '../../core/models/alert.model';

@Component({
  selector: 'app-app-layout',
  standalone: true,

  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,

    MatSidenavModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatBadgeModule,
    MatDividerModule,

    SidebarComponent,
  ],

  templateUrl: './app-layout.component.html',
  styleUrl: './app-layout.component.css',
})
export class AppLayoutComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);

  alerts: FarmAlert[] = [];
  isLoading = true;

  get user() {
    const authUser = this.authService.user();
    const email = authUser?.email ?? 'No email';
    const metadataName = authUser?.user_metadata?.['full_name'];
    const nameFromMetadata =
      typeof metadataName === 'string' ? metadataName.trim() : '';
    const fallbackName = authUser?.email?.split('@')[0]?.trim() || 'Farm User';
    const name = nameFromMetadata || fallbackName;
    const initials = this.buildInitials(name);

    return {
      name,
      email,
      initials,
    };
  }

  get unreadNotifications(): number {
    return this.alerts.filter((alert) => !alert.isRead).length;
  }

  get notifications() {
    return this.alerts.map(alert => ({
      id: alert.id,
      title: alert.title,
      message: alert.message,
      time: this.formatTime(alert.createdAt),
      icon: this.getIconForAlert(alert.type, alert.severity),
      type: this.getTypeForAlert(alert.severity),
      read: alert.isRead,
    }));
  }

  async ngOnInit(): Promise<void> {
    await this.loadAlerts();
  }

  async loadAlerts(): Promise<void> {
    this.isLoading = true;
    try {
      this.alerts = await this.alertService.getAlerts();
    } catch (error) {
      console.error('Failed to load alerts:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await this.alertService.markAsRead(id);
    await this.loadAlerts();
  }

  async markAllAsRead(): Promise<void> {
    await this.alertService.markAllAsRead();
    await this.loadAlerts();
  }

  async logout(): Promise<void> {
    await this.authService.signOut();
  }

  private buildInitials(name: string): string {
    const parts = name.split(' ').filter(Boolean);

    if (parts.length === 0) {
      return 'FU';
    }

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  private formatTime(dateString: string): string {
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

  private getIconForAlert(type: string, severity: string): string {
    if (type === 'heat-stress') return 'local_fire_department';
    if (type === 'temperature') return 'thermostat';
    if (severity === 'critical') return 'warning';
    if (severity === 'warning') return 'error_outline';
    return 'info';
  }

  private getTypeForAlert(severity: string): string {
    if (severity === 'critical') return 'danger';
    if (severity === 'warning') return 'warning';
    return 'info';
  }
}
