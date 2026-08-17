import { Injectable } from '@angular/core';
import {
  FarmAlert,
  AlertType,
  AlertSeverity
} from '../models/alert.model';
import { HeatRiskLevel } from '../models/heat-risk.model';
import { SupabaseService } from './supabase.service';

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

  constructor(private supabaseService: SupabaseService) {}

  async getAlerts(farmId?: string, zoneId?: string): Promise<FarmAlert[]> {
    try {
      if (farmId || zoneId) {
        const { data, error } = await this.supabaseService.client
          .from('alerts')
          .select('*')
          .eq('farm_id', farmId || '')
          .eq('zone_id', zoneId || '')
          .order('created_at', { ascending: false })
          .limit(20);

        if (data && !error) {
          return data.map(alert => ({
            id: alert.id,
            farmId: alert.farm_id,
            zoneId: alert.zone_id,
            type: alert.type,
            severity: alert.severity,
            title: alert.title,
            message: alert.message,
            isRead: alert.is_read,
            createdAt: alert.created_at,
            expiresAt: alert.expires_at
          }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch alerts from Supabase:', error);
    }

    return this.alerts.filter(
      alert => (!farmId || alert.farmId === farmId) && (!zoneId || alert.zoneId === zoneId)
    );
  }

  async getUnreadAlerts(farmId?: string, zoneId?: string): Promise<FarmAlert[]> {
    try {
      if (farmId || zoneId) {
        const { data, error } = await this.supabaseService.client
          .from('alerts')
          .select('*')
          .eq('farm_id', farmId || '')
          .eq('zone_id', zoneId || '')
          .eq('is_read', false)
          .order('created_at', { ascending: false });

        if (data && !error) {
          return data.map(alert => ({
            id: alert.id,
            farmId: alert.farm_id,
            zoneId: alert.zone_id,
            type: alert.type,
            severity: alert.severity,
            title: alert.title,
            message: alert.message,
            isRead: alert.is_read,
            createdAt: alert.created_at,
            expiresAt: alert.expires_at
          }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch unread alerts from Supabase:', error);
    }

    return this.alerts.filter(
      alert => !alert.isRead &&
        (!farmId || alert.farmId === farmId) &&
        (!zoneId || alert.zoneId === zoneId)
    );
  }

  async createAlert(
    farmId: string,
    zoneId: string,
    riskLevel: HeatRiskLevel,
    temperature: number,
    zoneName?: string
  ): Promise<FarmAlert | null> {
    if (riskLevel !== 'high' && riskLevel !== 'critical') {
      return null;
    }

    const hasRecentAlert = await this.hasRecentAlert(farmId, zoneId);
    if (hasRecentAlert) {
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

    await this.saveAlert(newAlert);
    this.alerts.push(newAlert);
    return newAlert;
  }

  async saveAlert(alert: FarmAlert): Promise<void> {
    try {
      const { error } = await this.supabaseService.client
        .from('alerts')
        .insert({
          farm_id: alert.farmId,
          zone_id: alert.zoneId,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          is_read: alert.isRead,
          created_at: alert.createdAt,
          expires_at: alert.expiresAt
        });

      if (error) {
        console.error('Failed to save alert:', error);
      }
    } catch (error) {
      console.error('Failed to save alert:', error);
    }
  }

  async hasRecentAlert(farmId: string, zoneId?: string): Promise<boolean> {
    try {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

      const { data, error } = await this.supabaseService.client
        .from('alerts')
        .select('id')
        .eq('farm_id', farmId)
        .eq('zone_id', zoneId || '')
        .eq('type', 'temperature')
        .eq('is_read', false)
        .gte('created_at', sixHoursAgo)
        .maybeSingle();

      return !error && !!data;
    } catch (error) {
      console.error('Failed to check for recent alert:', error);
      return false;
    }
  }

  async markAsRead(id: string): Promise<void> {
    try {
      const { error } = await this.supabaseService.client
        .from('alerts')
        .update({ is_read: true })
        .eq('id', id);

      if (error) {
        console.error('Failed to mark alert as read:', error);
      }

      const alert = this.alerts.find(
        item => item.id === id
      );

      if (alert) {
        alert.isRead = true;
      }
    } catch (error) {
      console.error('Failed to mark alert as read:', error);
    }
  }

  async markAllAsRead(farmId?: string, zoneId?: string): Promise<void> {
    try {
      let query = this.supabaseService.client
        .from('alerts')
        .update({ is_read: true });

      if (farmId) {
        query = query.eq('farm_id', farmId);
      }
      if (zoneId) {
        query = query.eq('zone_id', zoneId);
      }

      const { error } = await query;

      if (error) {
        console.error('Failed to mark all alerts as read:', error);
      }

      this.alerts.forEach(
        alert => {
          if (!farmId || alert.farmId === farmId) {
            if (!zoneId || alert.zoneId === zoneId) {
              alert.isRead = true;
            }
          }
        }
      );
    } catch (error) {
      console.error('Failed to mark all alerts as read:', error);
    }
  }

  async clearExpiredAlerts(): Promise<void> {
    try {
      const now = new Date().toISOString();

      const { error } = await this.supabaseService.client
        .from('alerts')
        .delete()
        .lt('expires_at', now);

      if (error) {
        console.error('Failed to clear expired alerts:', error);
      }

      const nowDate = new Date();
      this.alerts = this.alerts.filter(
        alert => !alert.expiresAt || new Date(alert.expiresAt) > nowDate
      );
    } catch (error) {
      console.error('Failed to clear expired alerts:', error);
    }
  }
}