import { Injectable } from '@angular/core';

import { SupabaseService } from './supabase.service';
import { FarmZone } from '../models/farm-zone.model';

@Injectable({
  providedIn: 'root',
})
export class ZoneService {
  constructor(private supabase: SupabaseService) {}

  // =====================================================
  // Get all zones for a farm
  // =====================================================

  async getZonesByFarm(farmId: string): Promise<FarmZone[]> {
    const { data, error } = await this.supabase.client
      .from('farm_zones')
      .select('*')
      .eq('farm_id', farmId)
      .order('created_at', {
        ascending: false,
      });

    if (error) {
      console.error('Failed to fetch zones:', error);

      throw error;
    }

    return (data ?? []).map((zone) => this.mapZone(zone));
  }

  // =====================================================
  // Get zone by ID
  // =====================================================

  async getZoneById(id: string): Promise<FarmZone | undefined> {
    const { data, error } = await this.supabase.client
      .from('farm_zones')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch zone:', error);

      throw error;
    }

    if (!data) {
      return undefined;
    }

    return this.mapZone(data);
  }

  // =====================================================
  // Create zone
  // =====================================================

  async addZone(
    farmId: string,
    zone: {
      name: string;
      description?: string;
      latitude?: number;
      longitude?: number;
      area?: number;
    },
  ): Promise<FarmZone> {
    const payload = {
      farm_id: farmId,

      name: zone.name,

      description: zone.description || null,

      latitude: zone.latitude ?? null,

      longitude: zone.longitude ?? null,

      area: zone.area ?? null,
    };

    const { data, error } = await this.supabase.client
      .from('farm_zones')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Failed to create zone:', error);

      throw error;
    }

    return this.mapZone(data);
  }

  // =====================================================
  // Update zone
  // =====================================================

  async updateZone(
    id: string,
    zone: {
      farmId?: string;
      name?: string;
      description?: string;
      latitude?: number;
      longitude?: number;
      area?: number;
    },
  ): Promise<FarmZone> {
    const payload: Record<string, unknown> = {};

    if (zone.farmId !== undefined) {
      payload['farm_id'] = zone.farmId;
    }

    if (zone.name !== undefined) {
      payload['name'] = zone.name;
    }

    if (zone.description !== undefined) {
      payload['description'] = zone.description || null;
    }

    if (zone.latitude !== undefined) {
      payload['latitude'] = zone.latitude ?? null;
    }

    if (zone.longitude !== undefined) {
      payload['longitude'] = zone.longitude ?? null;
    }

    if (zone.area !== undefined) {
      payload['area'] = zone.area ?? null;
    }

    const { data, error } = await this.supabase.client
      .from('farm_zones')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update zone:', error);

      throw error;
    }

    return this.mapZone(data);
  }

  // =====================================================
  // Delete zone
  // =====================================================

  async deleteZone(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('farm_zones')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to delete zone:', error);

      throw error;
    }
  }

  // =====================================================
  // Mapper
  // =====================================================

  private mapZone(data: any): FarmZone {
    return {
      id: data.id,

      farmId: data.farm_id,

      name: data.name,

      description: data.description ?? undefined,

      latitude: data.latitude ?? undefined,

      longitude: data.longitude ?? undefined,

      area:
        data.area !== null && data.area !== undefined
          ? Number(data.area)
          : undefined,

      createdAt: data.created_at ?? undefined,
      updatedAt: data.updated_at ?? undefined,

      boundary: data.boundary ?? undefined,
    };
  }
  async getAllZones(): Promise<FarmZone[]> {
    const { data, error } = await this.supabase.client
      .from('farm_zones')
      .select('*')
      .order('created_at', {
        ascending: false,
      });

    if (error) {
      console.error('Failed to fetch all zones:', error);

      throw error;
    }

    return (data ?? []).map((zone) => this.mapZone(zone));
  }
}
