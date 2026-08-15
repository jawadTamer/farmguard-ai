import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';

import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';

import { SidebarComponent } from '../sidebar/sidebar.component';
import { MobileNavComponent } from '../mobile-nav/mobile-nav.component';

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
    MobileNavComponent
  ],

  templateUrl: './app-layout.component.html',
  styleUrl: './app-layout.component.css'
})
export class AppLayoutComponent {

  user = {
    name: 'Jawad Tamer',
    email: 'jawad@example.com',
    initials: 'JT'
  };

  notifications = [
    {
      id: 1,
      title: 'High heat risk detected',
      message: 'Tomato Field A reached 41°C.',
      time: '5 min ago',
      icon: 'warning',
      type: 'danger',
      read: false
    },
    {
      id: 2,
      title: 'Irrigation recommended',
      message: 'Cooler irrigation window starts at 6:30 PM.',
      time: '20 min ago',
      icon: 'water_drop',
      type: 'info',
      read: false
    },
    {
      id: 3,
      title: 'Temperature updated',
      message: 'Greenhouse B is currently at 37°C.',
      time: '1 hour ago',
      icon: 'thermostat',
      type: 'warning',
      read: true
    }
  ];

  get unreadNotifications(): number {
    return this.notifications.filter(
      notification => !notification.read
    ).length;
  }

  markNotificationAsRead(id: number): void {
    const notification = this.notifications.find(
      item => item.id === id
    );

    if (notification) {
      notification.read = true;
    }
  }

  markAllAsRead(): void {
    this.notifications.forEach(
      notification => notification.read = true
    );
  }

  logout(): void {
    // هنربطها بـ Supabase Auth بعدين
    console.log('Logout');
  }

}