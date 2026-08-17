import { Injectable } from '@angular/core';
import {
  Recommendation,
  RecommendationType,
  RecommendationPriority
} from '../models/recommendation.model';
import { HeatRiskLevel } from '../models/heat-risk.model';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class RecommendationService {

  private recommendations: Recommendation[] = [];

  constructor(private supabaseService: SupabaseService) {}

  async getRecommendations(farmId?: string, zoneId?: string): Promise<Recommendation[]> {
    try {
      if (farmId || zoneId) {
        const { data, error } = await this.supabaseService.client
          .from('recommendations')
          .select('*')
          .eq('farm_id', farmId || '')
          .eq('zone_id', zoneId || '')
          .order('created_at', { ascending: false })
          .limit(20);

        if (data && !error) {
          return data.map(rec => ({
            id: rec.id,
            farmId: rec.farm_id,
            zoneId: rec.zone_id,
            type: rec.type,
            priority: rec.priority,
            title: rec.title,
            description: rec.description,
            actionItems: rec.action_items || [],
            riskLevel: rec.risk_level,
            createdAt: rec.created_at,
            expiresAt: rec.expires_at,
            isCompleted: rec.is_completed
          }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch recommendations from Supabase:', error);
    }

    return this.recommendations.filter(
      rec => (!farmId || rec.farmId === farmId) && (!zoneId || rec.zoneId === zoneId)
    );
  }

  async generateRecommendations(
    farmId: string,
    zoneId: string,
    riskLevel: HeatRiskLevel,
    temperature: number
  ): Promise<Recommendation[]> {
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

    for (const rec of newRecommendations) {
      await this.saveRecommendation(rec);
    }

    this.recommendations = [...this.recommendations, ...newRecommendations];
    return newRecommendations;
  }

  async saveRecommendation(rec: Recommendation): Promise<void> {
    try {
      const { error } = await this.supabaseService.client
        .from('recommendations')
        .insert({
          farm_id: rec.farmId,
          zone_id: rec.zoneId,
          type: rec.type,
          priority: rec.priority,
          title: rec.title,
          description: rec.description,
          action_items: rec.actionItems,
          risk_level: rec.riskLevel,
          created_at: rec.createdAt,
          expires_at: rec.expiresAt,
          is_completed: rec.isCompleted || false
        });

      if (error) {
        console.error('Failed to save recommendation:', error);
      }
    } catch (error) {
      console.error('Failed to save recommendation:', error);
    }
  }

  async hasRecentRecommendations(farmId: string, zoneId: string, riskLevel: HeatRiskLevel): Promise<boolean> {
    try {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

      const { data, error } = await this.supabaseService.client
        .from('recommendations')
        .select('id')
        .eq('farm_id', farmId)
        .eq('zone_id', zoneId)
        .eq('risk_level', riskLevel)
        .gte('created_at', sixHoursAgo)
        .maybeSingle();

      return !error && !!data;
    } catch (error) {
      console.error('Failed to check for recent recommendations:', error);
      return false;
    }
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

  async markAsCompleted(id: string): Promise<void> {
    try {
      const { error } = await this.supabaseService.client
        .from('recommendations')
        .update({ is_completed: true })
        .eq('id', id);

      if (error) {
        console.error('Failed to mark recommendation as completed:', error);
      }

      const recommendation = this.recommendations.find(r => r.id === id);
      if (recommendation) {
        recommendation.isCompleted = true;
      }
    } catch (error) {
      console.error('Failed to mark recommendation as completed:', error);
    }
  }

  async clearExpiredRecommendations(): Promise<void> {
    try {
      const now = new Date().toISOString();

      const { error } = await this.supabaseService.client
        .from('recommendations')
        .delete()
        .lt('expires_at', now);

      if (error) {
        console.error('Failed to clear expired recommendations:', error);
      }

      this.recommendations = this.recommendations.filter(
        rec => !rec.expiresAt || new Date(rec.expiresAt) > new Date()
      );
    } catch (error) {
      console.error('Failed to clear expired recommendations:', error);
    }
  }
}
