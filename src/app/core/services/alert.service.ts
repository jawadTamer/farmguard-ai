import { Injectable } from '@angular/core';
import { FarmAlert, AlertSeverity } from '../models/alert.model';
import { HeatRiskLevel } from '../models/heat-risk.model';
import { SupabaseService } from './supabase.service';
import { CropHeatRiskResponse } from '../models/crop-heat-risk.model';

@Injectable({ providedIn: 'root' })
export class AlertService {
  private alerts: FarmAlert[] = [];
  constructor(private supabaseService: SupabaseService) { }

  async getAlerts(farmId?: string, zoneId?: string): Promise<FarmAlert[]> {
    try {
      if (!farmId) return this.alerts.filter(a => !zoneId || a.zoneId === zoneId);
      let query = this.supabaseService.client.from('alerts').select('*').eq('farm_id', farmId);
      if (zoneId) query = query.eq('zone_id', zoneId);
      const { data, error } = await query.order('created_at', { ascending: false }).limit(20);
      if (error) throw error;
      return (data ?? []).map(a => ({ id: a.id, farmId: a.farm_id, zoneId: a.zone_id, type: a.type, severity: a.severity, title: a.title, message: a.message, isRead: a.is_read, createdAt: a.created_at }));
    } catch (error) { console.error('Failed to fetch alerts from Supabase:', error); return this.alerts.filter(a => (!farmId || a.farmId === farmId) && (!zoneId || a.zoneId === zoneId)); }
  }

  async getUnreadAlerts(farmId?: string, zoneId?: string): Promise<FarmAlert[]> {
    const alerts = await this.getAlerts(farmId, zoneId);
    return alerts.filter(a => !a.isRead);
  }

  async createAlert(farmId: string, zoneId: string | undefined, riskLevel: HeatRiskLevel, temperature: number, zoneName?: string): Promise<FarmAlert | null> {
    if (riskLevel !== 'high' && riskLevel !== 'critical') return null;
    if (await this.hasRecentAlert(farmId, zoneId)) return null;
    const severity: AlertSeverity = riskLevel === 'critical' ? 'critical' : 'warning';
    const alert: FarmAlert = {
      id: `alert-${Date.now()}`, farmId, zoneId, type: 'temperature', severity,
      title: riskLevel === 'critical' ? 'Critical heat risk detected' : 'High heat risk detected',
      message: `${zoneName ? `${zoneName} ` : ''}reached ${temperature}°C. ${riskLevel === 'critical' ? 'Immediate action required.' : 'Take preventive measures.'}`,
      isRead: false, createdAt: new Date().toISOString()
    };
    await this.saveAlert(alert); this.alerts.push(alert); return alert;
  }

  async createCropHeatRiskAlert(
    farmId: string,
    zoneId: string | undefined,
    cropId: string,
    mlResponse: CropHeatRiskResponse,
    temperature: number,
    humidity: number,
    growthStage: string,
    zoneName?: string,
    cropType?: string
  ): Promise<FarmAlert | null> {
    if (!mlResponse.predictions || mlResponse.predictions.length === 0) {
      return null;
    }

    const prediction = mlResponse.predictions[0];
    const riskClass = prediction.heat_risk_class.toLowerCase() as HeatRiskLevel;
    const confidence = prediction.probabilities[prediction.heat_risk_class];

    // Only create alerts for Moderate, High, or Critical risk
    if (riskClass === 'low') {
      return null;
    }

    if (await this.hasRecentCropHeatAlert(farmId, zoneId, cropId)) {
      return null;
    }

    const severity: AlertSeverity = riskClass === 'critical' ? 'critical' : 'warning';
    const title = this.getAlertTitle(riskClass);
    const message = this.getAlertMessage(riskClass, confidence, temperature, humidity, growthStage, zoneName, cropType);

    const alert: FarmAlert = {
      id: `alert-${Date.now()}`,
      farmId,
      zoneId,
      type: 'heat-stress',
      severity,
      title,
      message,
      isRead: false,
      createdAt: new Date().toISOString()
    };

    await this.saveAlert(alert);
    this.alerts.push(alert);
    return alert;
  }

  private getAlertTitle(riskClass: HeatRiskLevel): string {
    switch (riskClass) {
      case 'critical':
        return 'Critical crop heat risk detected';
      case 'high':
        return 'High crop heat risk detected';
      case 'moderate':
        return 'Moderate crop heat risk detected';
      default:
        return 'Crop heat risk detected';
    }
  }

  private getAlertMessage(
    riskClass: HeatRiskLevel,
    confidence: number,
    temperature: number,
    humidity: number,
    growthStage: string,
    zoneName?: string,
    cropType?: string
  ): string {
    const confidencePercent = (confidence * 100).toFixed(1);
    const location = zoneName ? `${zoneName}` : '';
    const crop = cropType ? `${cropType}` : 'Crop';

    let message = `${crop} in ${location} `;

    switch (riskClass) {
      case 'critical':
        message += `is at CRITICAL heat risk (confidence: ${confidencePercent}%). Temperature: ${temperature}°C, Humidity: ${humidity}%, Growth Stage: ${growthStage}. Immediate action required to prevent crop damage.`;
        break;
      case 'high':
        message += `is at HIGH heat risk (confidence: ${confidencePercent}%). Temperature: ${temperature}°C, Humidity: ${humidity}%, Growth Stage: ${growthStage}. Take preventive measures to protect your crop.`;
        break;
      case 'moderate':
        message += `is at MODERATE heat risk (confidence: ${confidencePercent}%). Temperature: ${temperature}°C, Humidity: ${humidity}%, Growth Stage: ${growthStage}. Monitor conditions closely.`;
        break;
      default:
        message += `heat risk assessment available. Temperature: ${temperature}°C, Humidity: ${humidity}%, Growth Stage: ${growthStage}.`;
    }

    return message;
  }

  async saveAlert(alert: FarmAlert): Promise<void> {
    try {
      const { error } = await this.supabaseService.client.from('alerts').insert({
        farm_id: alert.farmId, zone_id: alert.zoneId ?? null, type: alert.type,
        severity: alert.severity, title: alert.title, message: alert.message, is_read: alert.isRead
      });
      if (error) throw error;
    } catch (error) { console.error('Failed to save alert:', error); }
  }

  async hasRecentAlert(farmId: string, zoneId?: string): Promise<boolean> {
    try {
      const sixHoursAgo = new Date(Date.now() - 6 * 3600000).toISOString();
      let query = this.supabaseService.client.from('alerts').select('id').eq('farm_id', farmId).eq('type', 'temperature').gte('created_at', sixHoursAgo);
      if (zoneId) query = query.eq('zone_id', zoneId);
      const { data, error } = await query.limit(1).maybeSingle();
      return !error && !!data;
    } catch (error) { console.error('Failed to check for recent alert:', error); return false; }
  }

  async hasRecentCropHeatAlert(farmId: string, zoneId?: string, cropId?: string): Promise<boolean> {
    try {
      const sixHoursAgo = new Date(Date.now() - 6 * 3600000).toISOString();
      let query = this.supabaseService.client.from('alerts').select('id').eq('farm_id', farmId).eq('type', 'heat-stress').gte('created_at', sixHoursAgo);
      if (zoneId) query = query.eq('zone_id', zoneId);
      const { data, error } = await query.limit(1).maybeSingle();
      return !error && !!data;
    } catch (error) { console.error('Failed to check for recent crop heat alert:', error); return false; }
  }

  async markAsRead(id: string): Promise<void> {
    const { error } = await this.supabaseService.client.from('alerts').update({ is_read: true }).eq('id', id);
    if (error) console.error('Failed to mark alert as read:', error);
    const alert = this.alerts.find(a => a.id === id); if (alert) alert.isRead = true;
  }

  async markAllAsRead(farmId?: string, zoneId?: string): Promise<void> {
    let query = this.supabaseService.client.from('alerts').update({ is_read: true });
    if (farmId) query = query.eq('farm_id', farmId); if (zoneId) query = query.eq('zone_id', zoneId);
    const { error } = await query; if (error) console.error('Failed to mark all alerts as read:', error);
    this.alerts.forEach(a => { if ((!farmId || a.farmId === farmId) && (!zoneId || a.zoneId === zoneId)) a.isRead = true; });
  }

  async clearExpiredAlerts(): Promise<void> { this.alerts = []; }
}
