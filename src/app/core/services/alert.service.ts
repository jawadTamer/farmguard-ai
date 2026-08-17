import { Injectable } from '@angular/core';
import {
  FarmAlert,
  AlertType,
  AlertSeverity
} from '../models/alert.model';
import { HeatRiskLevel } from '../models/heat-risk.model';

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


  getAlerts(farmId?: string, zoneId?: string): FarmAlert[] {
    return this.alerts.filter(
      alert => (!farmId || alert.farmId === farmId) && (!zoneId || alert.zoneId === zoneId)
    );
  }

  getUnreadAlerts(farmId?: string, zoneId?: string): FarmAlert[] {
    return this.alerts.filter(
      alert => !alert.isRead &&
        (!farmId || alert.farmId === farmId) &&
        (!zoneId || alert.zoneId === zoneId)
    );
  }

  createAlert(
    farmId: string,
    zoneId: string,
    riskLevel: HeatRiskLevel,
    temperature: number,
    zoneName?: string
  ): FarmAlert | null {
    if (riskLevel !== 'high' && riskLevel !== 'critical') {
      return null;
    }

    const existingAlert = this.alerts.find(
      alert => alert.farmId === farmId &&
        alert.zoneId === zoneId &&
        alert.type === 'temperature' &&
        !alert.isRead &&
        new Date(alert.createdAt).getTime() > Date.now() - 6 * 60 * 60 * 1000
    );

    if (existingAlert) {
      return null;
    }

    const severity: AlertSeverity = riskLevel === 'critical' ? 'critical' : 'warning';

    const newAlert: FarmAlert = {
      id: `alert-${Date.now()}`,
      farmId,
      zoneId,
      type: 'temperature',
      severity,
      title: riskLevel === 'critical' ? 'Critical heat risk detected' : 'High heat risk detected',
      message: zoneName
        ? `${zoneName} reached ${temperature}°C. ${riskLevel === 'critical' ? 'Immediate action required.' : 'Take preventive measures.'}`
        : `Temperature reached ${temperature}°C. ${riskLevel === 'critical' ? 'Immediate action required.' : 'Take preventive measures.'}`,
      isRead: false,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    this.alerts.push(newAlert);
    return newAlert;
  }

  markAsRead(id: string): void {
    const alert = this.alerts.find(
      item => item.id === id
    );

    if (alert) {
      alert.isRead = true;
    }
  }

  markAllAsRead(farmId?: string, zoneId?: string): void {
    this.alerts.forEach(
      alert => {
        if (!farmId || alert.farmId === farmId) {
          if (!zoneId || alert.zoneId === zoneId) {
            alert.isRead = true;
          }
        }
      }
    );
  }

  clearExpiredAlerts(): void {
    const now = new Date();
    this.alerts = this.alerts.filter(
      alert => !alert.expiresAt || new Date(alert.expiresAt) > now
    );
  }
}