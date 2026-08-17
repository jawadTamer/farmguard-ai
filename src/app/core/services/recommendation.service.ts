import { Injectable } from '@angular/core';
import {
  Recommendation,
  RecommendationType,
  RecommendationPriority
} from '../models/recommendation.model';
import { HeatRiskLevel } from '../models/heat-risk.model';

@Injectable({
  providedIn: 'root'
})
export class RecommendationService {

  private recommendations: Recommendation[] = [];

  getRecommendations(farmId?: string, zoneId?: string): Recommendation[] {
    return this.recommendations.filter(
      rec => (!farmId || rec.farmId === farmId) && (!zoneId || rec.zoneId === zoneId)
    );
  }

  generateRecommendations(
    farmId: string,
    zoneId: string,
    riskLevel: HeatRiskLevel,
    temperature: number
  ): Recommendation[] {
    const newRecommendations: Recommendation[] = [];

    if (riskLevel === 'critical') {
      newRecommendations.push(
        this.createIrrigationRecommendation(farmId, zoneId, 'urgent'),
        this.createShadingRecommendation(farmId, zoneId, 'urgent'),
        this.createMonitoringRecommendation(farmId, zoneId, 'urgent')
      );
    } else if (riskLevel === 'high') {
      newRecommendations.push(
        this.createIrrigationRecommendation(farmId, zoneId, 'high'),
        this.createVentilationRecommendation(farmId, zoneId, 'high'),
        this.createMonitoringRecommendation(farmId, zoneId, 'high')
      );
    } else if (riskLevel === 'moderate') {
      newRecommendations.push(
        this.createIrrigationRecommendation(farmId, zoneId, 'medium'),
        this.createMonitoringRecommendation(farmId, zoneId, 'medium')
      );
    }

    this.recommendations = [...this.recommendations, ...newRecommendations];
    return newRecommendations;
  }

  private createIrrigationRecommendation(
    farmId: string,
    zoneId: string,
    priority: RecommendationPriority
  ): Recommendation {
    return {
      id: `rec-irrigation-${Date.now()}`,
      farmId,
      zoneId,
      type: 'irrigation',
      priority,
      title: 'Increase Irrigation',
      description: 'Provide additional water to help plants cope with heat stress.',
      actionItems: [
        'Irrigate during cooler hours (early morning or evening)',
        'Increase irrigation frequency by 20-30%',
        'Monitor soil moisture levels regularly',
        'Ensure proper drainage to prevent waterlogging'
      ],
      riskLevel: 'high',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      isCompleted: false
    };
  }

  private createShadingRecommendation(
    farmId: string,
    zoneId: string,
    priority: RecommendationPriority
  ): Recommendation {
    return {
      id: `rec-shading-${Date.now()}`,
      farmId,
      zoneId,
      type: 'shading',
      priority,
      title: 'Provide Shade',
      description: 'Reduce direct sunlight exposure to lower plant temperature.',
      actionItems: [
        'Install shade nets or temporary shading structures',
        'Use reflective mulch to reduce heat absorption',
        'Maintain adequate plant spacing for natural shade',
        'Consider intercropping with taller shade-providing plants'
      ],
      riskLevel: 'critical',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      isCompleted: false
    };
  }

  private createVentilationRecommendation(
    farmId: string,
    zoneId: string,
    priority: RecommendationPriority
  ): Recommendation {
    return {
      id: `rec-ventilation-${Date.now()}`,
      farmId,
      zoneId,
      type: 'ventilation',
      priority,
      title: 'Improve Ventilation',
      description: 'Enhance air circulation to reduce heat buildup.',
      actionItems: [
        'Open greenhouse vents or doors during cooler periods',
        'Use fans to improve air circulation',
        'Remove obstacles that block airflow',
        'Consider evaporative cooling systems'
      ],
      riskLevel: 'high',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      isCompleted: false
    };
  }

  private createMonitoringRecommendation(
    farmId: string,
    zoneId: string,
    priority: RecommendationPriority
  ): Recommendation {
    return {
      id: `rec-monitoring-${Date.now()}`,
      farmId,
      zoneId,
      type: 'monitoring',
      priority,
      title: 'Increase Monitoring',
      description: 'Closely monitor plants for signs of heat stress.',
      actionItems: [
        'Check plants twice daily for wilting or leaf scorch',
        'Monitor soil moisture levels regularly',
        'Watch for pest outbreaks (heat stress increases vulnerability)',
        'Document any visible damage for future reference'
      ],
      riskLevel: 'high',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      isCompleted: false
    };
  }

  markAsCompleted(id: string): void {
    const recommendation = this.recommendations.find(r => r.id === id);
    if (recommendation) {
      recommendation.isCompleted = true;
    }
  }

  clearExpiredRecommendations(): void {
    const now = new Date();
    this.recommendations = this.recommendations.filter(
      rec => !rec.expiresAt || new Date(rec.expiresAt) > now
    );
  }
}
