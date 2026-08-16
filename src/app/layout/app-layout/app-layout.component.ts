import { Component, inject } from '@angular/core';
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
export class AppLayoutComponent {
  private readonly authService = inject(AuthService);

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

  notifications = [
    {
      id: 1,
      title: 'High heat risk detected',
      message: 'Tomato Field A reached 41°C.',
      time: '5 min ago',
      icon: 'warning',
      type: 'danger',
      read: false,
    },
    {
      id: 2,
      title: 'Irrigation recommended',
      message: 'Cooler irrigation window starts at 6:30 PM.',
      time: '20 min ago',
      icon: 'water_drop',
      type: 'info',
      read: false,
    },
    {
      id: 3,
      title: 'Temperature updated',
      message: 'Greenhouse B is currently at 37°C.',
      time: '1 hour ago',
      icon: 'thermostat',
      type: 'warning',
      read: true,
    },
  ];

  get unreadNotifications(): number {
    return this.notifications.filter((notification) => !notification.read)
      .length;
  }

  markNotificationAsRead(id: number): void {
    const notification = this.notifications.find((item) => item.id === id);

    if (notification) {
      notification.read = true;
    }
  }

  markAllAsRead(): void {
    this.notifications.forEach((notification) => (notification.read = true));
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
}
