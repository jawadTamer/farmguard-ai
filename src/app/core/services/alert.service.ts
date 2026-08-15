import { Injectable } from '@angular/core';
import {
  FarmAlert
} from '../models/alert.model';

@Injectable({
  providedIn: 'root'
})
export class AlertService {

  private alerts: FarmAlert[] = [

    {
      id: 'alert-001',

      farmId: 'farm-001',
      zoneId: 'zone-001',

      type: 'temperature',

      severity: 'critical',

      title: 'High heat risk detected',

      message:
        'Tomato Field A reached 41°C.',

      isRead: false,

      createdAt: new Date().toISOString()
    },


    {
      id: 'alert-002',

      farmId: 'farm-001',

      zoneId: 'zone-001',

      type: 'irrigation',

      severity: 'warning',

      title: 'Irrigation recommended',

      message:
        'Consider irrigation during the cooler evening period.',

      isRead: false,

      createdAt: new Date().toISOString()
    },


    {
      id: 'alert-003',

      farmId: 'farm-002',

      zoneId: 'zone-002',

      type: 'temperature',

      severity: 'warning',

      title: 'Temperature increasing',

      message:
        'Greenhouse B is currently at 37°C.',

      isRead: true,

      createdAt: new Date().toISOString()
    }

  ];


  getAlerts(): FarmAlert[] {

    return this.alerts;

  }


  getUnreadAlerts(): FarmAlert[] {

    return this.alerts.filter(
      alert => !alert.isRead
    );

  }


  markAsRead(id: string): void {

    const alert = this.alerts.find(
      item => item.id === id
    );

    if (alert) {
      alert.isRead = true;
    }

  }


  markAllAsRead(): void {

    this.alerts.forEach(
      alert => alert.isRead = true
    );

  }

}