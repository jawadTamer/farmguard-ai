import { Injectable } from '@angular/core';
import { Recommendation, RecommendationType, RecommendationPriority } from '../models/recommendation.model';
import { HeatRiskLevel } from '../models/heat-risk.model';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class RecommendationService {
  private recommendations: Recommendation[] = [];
  constructor(private supabaseService: SupabaseService) {}

  async getRecommendations(farmId?: string, zoneId?: string): Promise<Recommendation[]> {
    try {
      if (!farmId) return this.recommendations.filter(r => !zoneId || r.zoneId === zoneId);
      let query = this.supabaseService.client.from('recommendations').select('*').eq('farm_id', farmId);
      if (zoneId) query = query.eq('zone_id', zoneId);
      const { data, error } = await query.order('created_at', { ascending: false }).limit(20);
      if (error) throw error;
      return (data ?? []).map(rec => ({
        id: rec.id, farmId: rec.farm_id, zoneId: rec.zone_id,
        type: (rec.category ?? 'monitoring') as RecommendationType,
        priority: rec.priority as RecommendationPriority, title: rec.title, description: rec.description,
        actionItems: [], riskLevel: 'low', createdAt: rec.created_at, isCompleted: false
      }));
    } catch (error) {
      console.error('Failed to fetch recommendations from Supabase:', error);
      return this.recommendations.filter(r => (!farmId || r.farmId === farmId) && (!zoneId || r.zoneId === zoneId));
    }
  }

  async generateRecommendations(farmId: string, zoneId: string | undefined, riskLevel: HeatRiskLevel, _temperature: number): Promise<Recommendation[]> {
    const recs: Recommendation[] = [];
    if (riskLevel === 'critical') recs.push(this.create(farmId, zoneId, 'irrigation', 'urgent', 'Increase Irrigation', 'Provide additional water to help plants cope with heat stress.'), this.create(farmId, zoneId, 'shading', 'urgent', 'Provide Shade', 'Reduce direct sunlight exposure to lower plant temperature.'), this.create(farmId, zoneId, 'monitoring', 'urgent', 'Increase Monitoring', 'Closely monitor plants for signs of heat stress.'));
    else if (riskLevel === 'high') recs.push(this.create(farmId, zoneId, 'irrigation', 'high', 'Increase Irrigation', 'Provide additional water to help plants cope with heat stress.'), this.create(farmId, zoneId, 'ventilation', 'high', 'Improve Ventilation', 'Enhance air circulation to reduce heat buildup.'), this.create(farmId, zoneId, 'monitoring', 'high', 'Increase Monitoring', 'Closely monitor plants for signs of heat stress.'));
    else if (riskLevel === 'moderate') recs.push(this.create(farmId, zoneId, 'irrigation', 'medium', 'Increase Irrigation', 'Provide additional water during cooler hours.'), this.create(farmId, zoneId, 'monitoring', 'medium', 'Increase Monitoring', 'Monitor plants and soil moisture closely.'));
    for (const rec of recs) await this.saveRecommendation(rec);
    this.recommendations = [...this.recommendations, ...recs];
    return recs;
  }

  async saveRecommendation(rec: Recommendation): Promise<void> {
    try {
      const { error } = await this.supabaseService.client.from('recommendations').insert({
        farm_id: rec.farmId, zone_id: rec.zoneId ?? null, category: rec.type,
        priority: rec.priority, title: rec.title, description: rec.description
      });
      if (error) throw error;
    } catch (error) { console.error('Failed to save recommendation:', error); }
  }

  async hasRecentRecommendations(farmId: string, zoneId: string | undefined, _riskLevel: HeatRiskLevel): Promise<boolean> {
    try {
      const sixHoursAgo = new Date(Date.now() - 6 * 3600000).toISOString();
      let query = this.supabaseService.client.from('recommendations').select('id').eq('farm_id', farmId).gte('created_at', sixHoursAgo);
      if (zoneId) query = query.eq('zone_id', zoneId);
      const { data, error } = await query.limit(1).maybeSingle();
      return !error && !!data;
    } catch (error) { console.error('Failed to check recent recommendations:', error); return false; }
  }

  private create(farmId: string, zoneId: string | undefined, type: RecommendationType, priority: RecommendationPriority, title: string, description: string): Recommendation {
    return { id: `rec-${Date.now()}-${Math.random()}`, farmId, zoneId, type, priority, title, description, actionItems: [], riskLevel: 'low', createdAt: new Date().toISOString(), isCompleted: false };
  }

  async markAsCompleted(id: string): Promise<void> { const rec = this.recommendations.find(r => r.id === id); if (rec) rec.isCompleted = true; }
  async clearExpiredRecommendations(): Promise<void> { this.recommendations = []; }
}
