import { Injectable } from '@angular/core';
import { HeatRisk, HeatRiskLevel } from '../models/heat-risk.model';
import { SupabaseService } from './supabase.service';
import { CropHeatRiskResponse } from '../models/crop-heat-risk.model';

@Injectable({ providedIn: 'root' })
export class RiskService {
  private risks: HeatRisk[] = [];

  constructor(private supabaseService: SupabaseService) { }

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

  async saveCropHeatRiskAssessment(
    farmId: string,
    zoneId: string | undefined,
    cropId: string,
    mlResponse: CropHeatRiskResponse,
    temperature: number,
    humidity: number,
    growthStage: string
  ): Promise<void> {
    if (!mlResponse.predictions || mlResponse.predictions.length === 0) {
      return;
    }

    const prediction = mlResponse.predictions[0];
    const riskClass = prediction.heat_risk_class.toLowerCase() as HeatRiskLevel;
    const confidence = prediction.probabilities[prediction.heat_risk_class];

    // Calculate risk score from confidence (0-100)
    const riskScore = confidence * 100;

    // Generate reason based on ML prediction
    const reason = this.generateMLReason(riskClass, confidence, temperature, humidity, growthStage);

    try {
      const { error } = await this.supabaseService.client.from('risk_assessments').insert({
        farm_id: farmId,
        zone_id: zoneId ?? null,
        crop_id: cropId,
        risk_type: 'heat',
        risk_level: riskClass,
        risk_score: Math.round(riskScore),
        temperature: temperature,
        heat_index: temperature, // Using temperature as proxy since ML doesn't return separate heat_index
        reason: reason,
        confidence: confidence,
        metadata: {
          source: 'ml_model',
          growth_stage: growthStage,
          humidity: humidity,
          probabilities: prediction.probabilities
        },
        calculated_at: new Date().toISOString()
      });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to save crop heat risk assessment:', error);
    }
  }

  private generateMLReason(
    riskClass: HeatRiskLevel,
    confidence: number,
    temperature: number,
    humidity: number,
    growthStage: string
  ): string {
    const confidencePercent = (confidence * 100).toFixed(1);

    switch (riskClass) {
      case 'critical':
        return `ML model predicts CRITICAL heat risk (confidence: ${confidencePercent}%). Temperature: ${temperature}°C, Humidity: ${humidity}%, Growth Stage: ${growthStage}. Immediate action required.`;
      case 'high':
        return `ML model predicts HIGH heat risk (confidence: ${confidencePercent}%). Temperature: ${temperature}°C, Humidity: ${humidity}%, Growth Stage: ${growthStage}. Take preventive measures.`;
      case 'moderate':
        return `ML model predicts MODERATE heat risk (confidence: ${confidencePercent}%). Temperature: ${temperature}°C, Humidity: ${humidity}%, Growth Stage: ${growthStage}. Monitor conditions closely.`;
      case 'low':
        return `ML model predicts LOW heat risk (confidence: ${confidencePercent}%). Temperature: ${temperature}°C, Humidity: ${humidity}%, Growth Stage: ${growthStage}. Conditions are favorable.`;
      default:
        return `ML heat risk assessment available. Risk level: ${riskClass}, Confidence: ${confidencePercent}%.`;
    }
  }
}
