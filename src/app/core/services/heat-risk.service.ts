import { Injectable } from '@angular/core';
import { HeatRisk, HeatRiskLevel } from '../models/heat-risk.model';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class HeatRiskService {
  private risks: HeatRisk[] = [];

  constructor(private supabaseService: SupabaseService) {}

  async getRisks(farmId?: string, zoneId?: string): Promise<HeatRisk[]> {
    try {
      if (!farmId) return this.risks.filter(r => !zoneId || r.zoneId === zoneId);
      let query = this.supabaseService.client.from('risk_assessments').select('*').eq('farm_id', farmId);
      if (zoneId) query = query.eq('zone_id', zoneId);
      const { data, error } = await query.order('calculated_at', { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []).map(risk => ({
        id: risk.id, farmId: risk.farm_id, zoneId: risk.zone_id, cropId: risk.crop_id,
        temperature: Number(risk.temperature), riskLevel: risk.risk_level,
        riskScore: Number(risk.risk_score), reason: risk.reason,
        detectedAt: risk.calculated_at ?? risk.created_at
      }));
    } catch (error) {
      console.error('Failed to fetch risks from Supabase:', error);
      return this.risks.filter(r => (!farmId || r.farmId === farmId) && (!zoneId || r.zoneId === zoneId));
    }
  }

  getRiskLevel(temperature: number): HeatRiskLevel {
    if (temperature > 40) return 'critical';
    if (temperature >= 36) return 'high';
    if (temperature >= 31) return 'moderate';
    return 'low';
  }

  calculateRisk(temperature: number, farmId: string, zoneId?: string, cropId?: string): HeatRisk {
    const riskLevel = this.getRiskLevel(temperature);
    const riskScore = this.calculateRiskScore(temperature, riskLevel);
    const thresholdTemperature = this.getThresholdTemperature(riskLevel);
    return {
      id: `risk-${Date.now()}`, farmId, zoneId, cropId, temperature, riskLevel, riskScore,
      reason: this.generateReason(temperature, riskLevel, thresholdTemperature),
      detectedAt: new Date().toISOString()
    };
  }

  async saveRiskAssessment(risk: HeatRisk): Promise<void> {
    try {
      const { error } = await this.supabaseService.client.from('risk_assessments').insert({
        farm_id: risk.farmId, zone_id: risk.zoneId ?? null, crop_id: risk.cropId ?? null,
        risk_type: 'heat', risk_level: risk.riskLevel, risk_score: Math.round(risk.riskScore),
        temperature: risk.temperature, reason: risk.reason, calculated_at: risk.detectedAt
      });
      if (error) throw error;
    } catch (error) { console.error('Failed to save risk assessment:', error); }
  }

  async hasRecentRiskAssessment(farmId: string, zoneId?: string): Promise<boolean> {
    try {
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      let query = this.supabaseService.client.from('risk_assessments').select('id').eq('farm_id', farmId).gte('calculated_at', oneHourAgo);
      if (zoneId) query = query.eq('zone_id', zoneId);
      const { data, error } = await query.limit(1).maybeSingle();
      return !error && !!data;
    } catch (error) { console.error('Failed to check for recent risk assessment:', error); return false; }
  }

  private calculateRiskScore(temperature: number, riskLevel: HeatRiskLevel): number {
    const base = { low: 25, moderate: 50, high: 75, critical: 90 }[riskLevel];
    if (riskLevel === 'critical') return Math.min(100, base + (temperature - 40) * 2);
    if (riskLevel === 'high') return base + (temperature - 36) * 3;
    if (riskLevel === 'moderate') return base + (temperature - 31) * 2;
    return Math.min(100, base + temperature * 0.5);
  }

  private getThresholdTemperature(level: HeatRiskLevel): number { return { low: 30, moderate: 31, high: 36, critical: 40 }[level]; }

  private generateReason(temperature: number, level: HeatRiskLevel, threshold: number): string {
    if (level === 'critical') return `Critical temperature (${temperature}°C) detected. Immediate action required.`;
    if (level === 'high') return `Temperature (${temperature}°C) exceeds the safe threshold (${threshold}°C). Heat stress risk is elevated.`;
    if (level === 'moderate') return `Temperature (${temperature}°C) is approaching the upper safe limit (${threshold}°C). Monitor closely.`;
    return `Temperature (${temperature}°C) is within the safe range (below ${threshold}°C).`;
  }
}
