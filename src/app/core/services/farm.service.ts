import { Injectable } from '@angular/core';

import { Farm } from '../models/farm.model';
import { SupabaseService } from '../supabase/supabase.service';

export type FarmStatus = 'active' | 'inactive';

export interface CreateFarmData {
  name: string;
  location?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  area?: number;
  areaUnit?: 'acre' | 'hectare';
  status?: FarmStatus;
}

@Injectable({
  providedIn: 'root',
})
export class FarmService {
  constructor(private readonly supabaseService: SupabaseService) {}

  // =====================================================
  // Get All Farms
  // =====================================================

  async getFarms(): Promise<Farm[]> {
    const { data, error } = await this.supabaseService.client
      .from('farms')
      .select('*')
      .order('created_at', {
        ascending: false,
      });

    if (error) {
      console.error('Failed to load farms:', error);
      throw error;
    }

    const farms = (data ?? []).map((farm) => this.mapFarm(farm));

    const farmIds = farms.map((farm) => farm.id);

    const [zoneCounts, cropCounts, livestockCounts] = await Promise.all([
      this.getZoneCountsByFarmIds(farmIds),
      this.getCropCountsByFarmIds(farmIds),
      this.getLivestockCountsByFarmIds(farmIds),
    ]);

    return farms.map((farm) => ({
      ...farm,
      zonesCount: zoneCounts[farm.id] ?? 0,
      cropsCount: cropCounts[farm.id] ?? 0,
      livestockCount: livestockCounts[farm.id] ?? 0,
    }));
  }

  // =====================================================
  // Get Farm By ID
  // =====================================================

  async getFarmById(id: string): Promise<Farm | undefined> {
    const { data, error } = await this.supabaseService.client
      .from('farms')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Failed to load farm:', error);
      throw error;
    }

    if (!data) {
      return undefined;
    }

    const farm = this.mapFarm(data);

    const [zoneCounts, cropCounts, livestockCounts] = await Promise.all([
      this.getZoneCountsByFarmIds([farm.id]),
      this.getCropCountsByFarmIds([farm.id]),
      this.getLivestockCountsByFarmIds([farm.id]),
    ]);

    return {
      ...farm,
      zonesCount: zoneCounts[farm.id] ?? 0,
      cropsCount: cropCounts[farm.id] ?? 0,
      livestockCount: livestockCounts[farm.id] ?? 0,
    };
  }

  // =====================================================
  // Add Farm
  // =====================================================

  async addFarm(farmData: CreateFarmData): Promise<Farm> {
    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await this.supabaseService.client.auth.getUser();

    if (userError) {
      throw userError;
    }

    if (!user) {
      throw new Error('You must be logged in to create a farm.');
    }

    // Insert into Supabase
    const { data, error } = await this.supabaseService.client
      .from('farms')
      .insert({
        owner_id: user.id,

        name: farmData.name,

        description: farmData.description ?? null,

        latitude: farmData.latitude ?? null,

        longitude: farmData.longitude ?? null,

        area: farmData.area ?? null,

        area_unit: farmData.areaUnit ?? 'acre',

        status: farmData.status ?? 'active',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create farm:', error);

      throw error;
    }

    return this.mapFarm(data);
  }

  // =====================================================
  // Update Farm
  // =====================================================

  async updateFarm(
    id: string,
    farmData: Partial<CreateFarmData>,
  ): Promise<Farm> {
    const { data, error } = await this.supabaseService.client
      .from('farms')
      .update({
        name: farmData.name,

        description: farmData.description ?? null,

        latitude: farmData.latitude ?? null,

        longitude: farmData.longitude ?? null,

        area: farmData.area ?? null,

        area_unit: farmData.areaUnit ?? 'acre',

        status: farmData.status ?? 'active',
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update farm:', error);

      throw error;
    }

    return this.mapFarm(data);
  }

  // =====================================================
  // Delete Farm
  // =====================================================

  async deleteFarm(id: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('farms')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to delete farm:', error);

      throw error;
    }
  }

  // =====================================================
  // Zone counts
  // =====================================================

  private async getZoneCountsByFarmIds(
    farmIds: string[],
  ): Promise<Record<string, number>> {
    if (!farmIds.length) {
      return {};
    }

    const { data, error } = await this.supabaseService.client
      .from('farm_zones')
      .select('farm_id');

    if (error) {
      console.error('Failed to load zone counts:', error);
      return {};
    }

    const counts: Record<string, number> = {};

    for (const farmId of farmIds) {
      counts[farmId] = 0;
    }

    for (const row of data ?? []) {
      const farmId = row.farm_id;

      if (farmIds.includes(farmId)) {
        counts[farmId] = (counts[farmId] ?? 0) + 1;
      }
    }

    return counts;
  }

  // =====================================================
  // Crop counts
  // =====================================================

  private async getCropCountsByFarmIds(
    farmIds: string[],
  ): Promise<Record<string, number>> {
    if (!farmIds.length) {
      return {};
    }

    // Get zones for these farms
    const { data: zones, error: zonesError } = await this.supabaseService.client
      .from('farm_zones')
      .select('id, farm_id')
      .in('farm_id', farmIds);

    if (zonesError) {
      console.error('Failed to load zones for crop counts:', zonesError);
      return {};
    }

    const zoneIds = (zones ?? []).map((z) => z.id);
    const zoneToFarmMap: Record<string, string> = {};
    (zones ?? []).forEach((z) => {
      zoneToFarmMap[z.id] = z.farm_id;
    });

    if (!zoneIds.length) {
      const counts: Record<string, number> = {};
      for (const farmId of farmIds) {
        counts[farmId] = 0;
      }
      return counts;
    }

    // Get crops for these zones
    const { data: crops, error: cropsError } = await this.supabaseService.client
      .from('crops')
      .select('zone_id')
      .in('zone_id', zoneIds);

    if (cropsError) {
      console.error('Failed to load crop counts:', cropsError);
      return {};
    }

    const counts: Record<string, number> = {};

    for (const farmId of farmIds) {
      counts[farmId] = 0;
    }

    for (const crop of crops ?? []) {
      const farmId = zoneToFarmMap[crop.zone_id];
      if (farmId && farmIds.includes(farmId)) {
        counts[farmId] = (counts[farmId] ?? 0) + 1;
      }
    }

    return counts;
  }

  // =====================================================
  // Livestock counts
  // =====================================================

  private async getLivestockCountsByFarmIds(
    farmIds: string[],
  ): Promise<Record<string, number>> {
    if (!farmIds.length) {
      return {};
    }

    // Get zones for these farms
    const { data: zones, error: zonesError } = await this.supabaseService.client
      .from('farm_zones')
      .select('id, farm_id')
      .in('farm_id', farmIds);

    if (zonesError) {
      console.error('Failed to load zones for livestock counts:', zonesError);
      return {};
    }

    const zoneIds = (zones ?? []).map((z) => z.id);
    const zoneToFarmMap: Record<string, string> = {};
    (zones ?? []).forEach((z) => {
      zoneToFarmMap[z.id] = z.farm_id;
    });

    if (!zoneIds.length) {
      const counts: Record<string, number> = {};
      for (const farmId of farmIds) {
        counts[farmId] = 0;
      }
      return counts;
    }

    // Get livestock for these zones
    const { data: livestock, error: livestockError } =
      await this.supabaseService.client
        .from('livestock')
        .select('zone_id')
        .in('zone_id', zoneIds);

    if (livestockError) {
      console.error('Failed to load livestock counts:', livestockError);
      return {};
    }

    const counts: Record<string, number> = {};

    for (const farmId of farmIds) {
      counts[farmId] = 0;
    }

    for (const animal of livestock ?? []) {
      const farmId = zoneToFarmMap[animal.zone_id];
      if (farmId && farmIds.includes(farmId)) {
        counts[farmId] = (counts[farmId] ?? 0) + 1;
      }
    }

    return counts;
  }

  // =====================================================
  // Map Supabase → Angular Model
  // =====================================================

  private mapFarm(data: any): Farm {
    return {
      id: data.id,

      name: data.name,

      location: data.location ?? 'Fayoum, Egypt',
      description: data.description ?? '',

      latitude: data.latitude ?? undefined,

      longitude: data.longitude ?? undefined,

      area: data.area ?? undefined,

      areaUnit: data.area_unit ?? 'acre',

      status: data.status === 'inactive' ? 'inactive' : 'active',

      // These will come from related tables later.
      zonesCount: 0,

      cropsCount: 0,

      livestockCount: 0,

      createdAt: data.created_at ?? undefined,

      updatedAt: data.updated_at ?? undefined,
    };
  }
}
