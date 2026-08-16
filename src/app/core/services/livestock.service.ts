import { Injectable } from '@angular/core';

import { Livestock } from '../models/livestock.model';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class LivestockService {
  constructor(private readonly supabase: SupabaseService) {}

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
      status?: 'healthy' | 'warning' | 'critical';
    },
  ): Promise<Livestock> {
    const payload = {
      zone_id: zoneId,
      livestock_type: livestock.livestockType,
      breed: livestock.breed ?? null,
      count: livestock.count ?? null,
      status: livestock.status ?? 'healthy',
    };

    const { data, error } = await this.supabase.client
      .from('livestock')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Failed to create livestock:', error);
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
      status?: 'healthy' | 'warning' | 'critical';
    },
  ): Promise<Livestock> {
    const payload: Record<string, unknown> = {};

    if (livestock.zoneId !== undefined) {
      payload['zone_id'] = livestock.zoneId;
    }

    if (livestock.livestockType !== undefined) {
      payload['livestock_type'] = livestock.livestockType;
    }

    if (livestock.breed !== undefined) {
      payload['breed'] = livestock.breed || null;
    }

    if (livestock.count !== undefined) {
      payload['count'] = livestock.count ?? null;
    }

    if (livestock.status !== undefined) {
      payload['status'] = livestock.status;
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
        data.livestock_type ?? data.animal_type ?? data.species ?? 'Unknown',
      breed: data.breed ?? undefined,
      count: data.count ?? data.head_count ?? undefined,
      status: data.status ?? 'healthy',
      createdAt: data.created_at ?? undefined,
      updatedAt: data.updated_at ?? undefined,
    };
  }
}
