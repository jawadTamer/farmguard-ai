import { Injectable } from '@angular/core';
import {
  HeatRisk,
  HeatRiskLevel
} from '../models/heat-risk.model';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class HeatRiskService {

  private risks: HeatRisk[] = [

    {
      id: 'risk-001',

      farmId: 'farm-001',
      zoneId: 'zone-001',
      cropId: 'crop-001',

      temperature: 41,

      riskLevel: 'high',

      riskScore: 87,

      reason:
        'Temperature is significantly above the optimal range for tomatoes during flowering.',

      detectedAt: new Date().toISOString()
    },


    {
      id: 'risk-002',

      farmId: 'farm-002',
      zoneId: 'zone-002',

      temperature: 37,

      riskLevel: 'moderate',

      riskScore: 61,

      reason:
        'Temperature is approaching the upper safe range.',

      detectedAt: new Date().toISOString()
    },


    {
      id: 'risk-003',

      farmId: 'farm-003',
      zoneId: 'zone-001',

      temperature: 32,

      riskLevel: 'low',

      riskScore: 25,

      reason:
        'Temperature is currently within the safe range.',

      detectedAt: new Date().toISOString()
    }

  ];

  constructor(private supabaseService: SupabaseService) {}

  async getRisks(farmId?: string, zoneId?: string): Promise<HeatRisk[]> {
    try {
      if (farmId || zoneId) {
        const { data, error } = await this.supabaseService.client
          .from('risk_assessments')
          .select('*')
          .eq('farm_id', farmId || '')
          .eq('zone_id', zoneId || '')
          .order('detected_at', { ascending: false })
          .limit(10);

        if (data && !error) {
          return data.map(risk => ({
            id: risk.id,
            farmId: risk.farm_id,
            zoneId: risk.zone_id,
            cropId: risk.crop_id,
            temperature: risk.temperature,
            riskLevel: risk.risk_level,
            riskScore: risk.risk_score,
            reason: risk.reason,
            detectedAt: risk.detected_at,
            expiresAt: risk.expires_at
          }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch risks from Supabase:', error);
    }

    return this.risks.filter(
      risk => (!farmId || risk.farmId === farmId) && (!zoneId || risk.zoneId === zoneId)
    );
  }

  getRiskLevel(temperature: number): HeatRiskLevel {
    if (temperature > 40) {
      return 'critical';
    }

    if (temperature >= 36) {
      return 'high';
    }

    if (temperature >= 31) {
      return 'moderate';
    }

    return 'low';
  }

  calculateRisk(
    temperature: number,
    farmId: string,
    zoneId?: string,
    cropId?: string
  ): HeatRisk {
    const riskLevel = this.getRiskLevel(temperature);
    const riskScore = this.calculateRiskScore(temperature, riskLevel);
    const thresholdTemperature = this.getThresholdTemperature(riskLevel);
    const reason = this.generateReason(temperature, riskLevel, thresholdTemperature);

    return {
      id: `risk-${Date.now()}`,
      farmId,
      zoneId,
      cropId,
      temperature,
      riskLevel,
      riskScore,
      reason,
      detectedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
  }

  async saveRiskAssessment(risk: HeatRisk): Promise<void> {
    try {
      const { error } = await this.supabaseService.client
        .from('risk_assessments')
        .insert({
          farm_id: risk.farmId,
          zone_id: risk.zoneId,
          crop_id: risk.cropId,
          temperature: risk.temperature,
          risk_level: risk.riskLevel,
          risk_score: risk.riskScore,
          reason: risk.reason,
          detected_at: risk.detectedAt,
          expires_at: risk.expiresAt
        });

      if (error) {
        console.error('Failed to save risk assessment:', error);
      }
    } catch (error) {
      console.error('Failed to save risk assessment:', error);
    }
  }

  async hasRecentRiskAssessment(farmId: string, zoneId?: string): Promise<boolean> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const { data, error } = await this.supabaseService.client
        .from('risk_assessments')
        .select('id')
        .eq('farm_id', farmId)
        .eq('zone_id', zoneId || '')
        .gte('detected_at', oneHourAgo)
        .maybeSingle();

      return !error && !!data;
    } catch (error) {
      console.error('Failed to check for recent risk assessment:', error);
      return false;
    }
  }

  private calculateRiskScore(temperature: number, riskLevel: HeatRiskLevel): number {
    const baseScores = {
      low: 25,
      moderate: 50,
      high: 75,
      critical: 90
    };

    const baseScore = baseScores[riskLevel];

    if (riskLevel === 'critical') {
      return Math.min(100, baseScore + (temperature - 40) * 2);
    }

    if (riskLevel === 'high') {
      return baseScore + (temperature - 36) * 3;
    }

    if (riskLevel === 'moderate') {
      return baseScore + (temperature - 31) * 2;
    }

    return baseScore + temperature * 0.5;
  }

  private getThresholdTemperature(riskLevel: HeatRiskLevel): number {
    const thresholds = {
      low: 30,
      moderate: 31,
      high: 36,
      critical: 40
    };

    return thresholds[riskLevel];
  }

  private generateReason(
    temperature: number,
    riskLevel: HeatRiskLevel,
    threshold: number
  ): string {
    const reasons = {
      low: `Temperature (${temperature}°C) is within the safe range (below ${threshold}°C).`,
      moderate: `Temperature (${temperature}°C) is approaching the upper safe limit (${threshold}°C). Monitor closely.`,
      high: `Temperature (${temperature}°C) exceeds the safe threshold (${threshold}°C). Heat stress risk is elevated.`,
      critical: `Critical temperature (${temperature}°C) detected. Immediate action required to prevent heat damage.`
    };

    return reasons[riskLevel];
  }
}