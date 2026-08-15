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


  getRisks(): HeatRisk[] {

    return this.risks;

  }


  getRiskLevel(
    temperature: number
  ): HeatRiskLevel {

    if (temperature >= 42) {
      return 'critical';
    }

    if (temperature >= 38) {
      return 'high';
    }

    if (temperature >= 34) {
      return 'moderate';
    }

    return 'low';

  }

}