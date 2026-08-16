import { Injectable } from '@angular/core';

import { Crop } from '../models/crop.model';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class CropService {
  constructor(private readonly supabase: SupabaseService) {}

  async getAllCrops(): Promise<Crop[]> {
    const { data, error } = await this.supabase.client
      .from('crops')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch crops:', error);
      throw error;
    }

    return (data ?? []).map((crop) => this.mapCrop(crop));
  }

  async getCropsByZone(zoneId: string): Promise<Crop[]> {
    const { data, error } = await this.supabase.client
      .from('crops')
      .select('*')
      .eq('zone_id', zoneId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch crops for zone:', error);
      throw error;
    }

    return (data ?? []).map((crop) => this.mapCrop(crop));
  }

  async getCropById(id: string): Promise<Crop | undefined> {
    const { data, error } = await this.supabase.client
      .from('crops')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch crop:', error);
      throw error;
    }

    if (!data) {
      return undefined;
    }

    return this.mapCrop(data);
  }

  async addCrop(
    zoneId: string,
    crop: {
      cropType: string;
      variety?: string;
      growthStage: string;
      plantingDate?: string;
    },
  ): Promise<Crop> {
    const payload = {
      zone_id: zoneId,
      crop_type: crop.cropType,
      variety: crop.variety ?? null,
      growth_stage: crop.growthStage,
      planting_date: crop.plantingDate ?? null,
    };

    const { data, error } = await this.supabase.client
      .from('crops')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Failed to create crop:', error);
      throw error;
    }

    return this.mapCrop(data);
  }

  async updateCrop(
    id: string,
    crop: {
      zoneId?: string;
      cropType?: string;
      variety?: string;
      growthStage?: string;
      plantingDate?: string;
    },
  ): Promise<Crop> {
    const payload: Record<string, unknown> = {};

    if (crop.zoneId !== undefined) {
      payload['zone_id'] = crop.zoneId;
    }

    if (crop.cropType !== undefined) {
      payload['crop_type'] = crop.cropType;
    }

    if (crop.variety !== undefined) {
      payload['variety'] = crop.variety || null;
    }

    if (crop.growthStage !== undefined) {
      payload['growth_stage'] = crop.growthStage;
    }

    if (crop.plantingDate !== undefined) {
      payload['planting_date'] = crop.plantingDate || null;
    }

    const { data, error } = await this.supabase.client
      .from('crops')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update crop:', error);
      throw error;
    }

    return this.mapCrop(data);
  }

  async deleteCrop(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('crops')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to delete crop:', error);
      throw error;
    }
  }

  private mapCrop(data: any): Crop {
    return {
      id: data.id,
      zoneId: data.zone_id,
      cropType: data.crop_type,
      variety: data.variety ?? undefined,
      growthStage: data.growth_stage,
      plantingDate: data.planting_date ?? undefined,
      createdAt: data.created_at ?? undefined,
      updatedAt: data.updated_at ?? undefined,
    };
  }
}
