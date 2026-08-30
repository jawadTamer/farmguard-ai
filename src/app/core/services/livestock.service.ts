import { Injectable } from '@angular/core';

import { Livestock } from '../models/livestock.model';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class LivestockService {
  constructor(private readonly supabase: SupabaseService) { }

  async getAllLivestock(): Promise<Livestock[]> {
    const { data, error } = await this.supabase.client
      .from('livestock')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch livestock:', error);
      throw error;
    }

    return (data ?? []).map((animal) => this.mapLivestock(animal));
  }

  async getLivestockByZone(zoneId: string): Promise<Livestock[]> {
    const { data, error } = await this.supabase.client
      .from('livestock')
      .select('*')
      .eq('zone_id', zoneId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch livestock for zone:', error);
      throw error;
    }

    return (data ?? []).map((animal) => this.mapLivestock(animal));
  }

  async getLivestockById(id: string): Promise<Livestock | undefined> {
    const { data, error } = await this.supabase.client
      .from('livestock')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch livestock:', error);
      throw error;
    }

    if (!data) {
      return undefined;
    }

    return this.mapLivestock(data);
  }

  async addLivestock(
    zoneId: string,
    livestock: {
      livestockType: string;
      breed?: string;
      count?: number;
      sex?: 'male' | 'female';
      physiologicalStage?: string;
      ageYears?: number;
      weightKg?: number;
    },
  ): Promise<Livestock> {
    const payload: Record<string, unknown> = {
      zone_id: zoneId,
      animal_type: livestock.livestockType,
      breed: livestock.breed ?? null,
      quantity: livestock.count ?? 0,
    };

    if (livestock.sex) {
      payload['sex'] = livestock.sex;
    }
    if (livestock.physiologicalStage) {
      payload['physiological_stage'] = livestock.physiologicalStage;
    }
    if (livestock.ageYears !== undefined && livestock.ageYears !== null) {
      payload['age_years'] = livestock.ageYears;
    }
    if (livestock.weightKg !== undefined && livestock.weightKg !== null) {
      payload['weight_kg'] = livestock.weightKg;
    }

    console.log('Attempting to insert livestock with payload:', payload);

    const { data, error } = await this.supabase.client
      .from('livestock')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Failed to create livestock. Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }

    return this.mapLivestock(data);
  }

  async updateLivestock(
    id: string,
    livestock: {
      zoneId?: string;
      livestockType?: string;
      breed?: string;
      count?: number;
      sex?: 'male' | 'female';
      physiologicalStage?: string;
      ageYears?: number;
      weightKg?: number;
    },
  ): Promise<Livestock> {
    const payload: Record<string, unknown> = {};

    if (livestock.zoneId !== undefined) {
      payload['zone_id'] = livestock.zoneId;
    }

    if (livestock.livestockType !== undefined) {
      payload['animal_type'] = livestock.livestockType;
    }

    if (livestock.breed !== undefined) {
      payload['breed'] = livestock.breed || null;
    }

    if (livestock.count !== undefined) {
      payload['quantity'] = livestock.count ?? 0;
    }

    if (livestock.sex !== undefined) {
      payload['sex'] = livestock.sex;
    }
    if (livestock.physiologicalStage !== undefined) {
      payload['physiological_stage'] = livestock.physiologicalStage;
    }
    if (livestock.ageYears !== undefined) {
      payload['age_years'] = livestock.ageYears;
    }
    if (livestock.weightKg !== undefined) {
      payload['weight_kg'] = livestock.weightKg;
    }

    const { data, error } = await this.supabase.client
      .from('livestock')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update livestock:', error);
      throw error;
    }

    return this.mapLivestock(data);
  }

  async deleteLivestock(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('livestock')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to delete livestock:', error);
      throw error;
    }
  }

  private mapLivestock(data: any): Livestock {
    return {
      id: data.id,
      zoneId: data.zone_id,
      livestockType:
        data.animal_type ?? data.livestock_type ?? data.species ?? 'Unknown',
      breed: data.breed ?? undefined,
      count: data.quantity ?? data.count ?? data.head_count ?? undefined,
      ageGroup: data.age_group ?? undefined,
      sex: data.sex ?? undefined,
      physiologicalStage: data.physiological_stage ?? undefined,
      ageYears: data.age_years ?? undefined,
      weightKg: data.weight_kg ?? undefined,
      createdAt: data.created_at ?? undefined,
      updatedAt: data.updated_at ?? undefined,
    };
  }
}
