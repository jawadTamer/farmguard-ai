import { Injectable } from '@angular/core';
import {
  HeatRisk,
  HeatRiskLevel
} from '../models/heat-risk.model';

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


  getRisks(farmId?: string, zoneId?: string): HeatRisk[] {
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