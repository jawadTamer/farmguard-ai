import { Injectable } from '@angular/core';

import { Farm } from '../models/farm.model';
import { SupabaseService } from '../supabase/supabase.service';

export interface CreateFarmData {
  name: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  area?: number;
}

@Injectable({
  providedIn: 'root'
})
export class FarmService {

  constructor(
    private readonly supabaseService: SupabaseService
  ) {}

  // =====================================================
  // Get All Farms
  // =====================================================

  async getFarms(): Promise<Farm[]> {

    const {
      data,
      error
    } = await this.supabaseService.client
      .from('farms')
      .select('*')
      .order('created_at', {
        ascending: false
      });

    if (error) {
      console.error('Failed to load farms:', error);
      throw error;
    }

    return (data ?? []).map(
      farm => this.mapFarm(farm)
    );

  }


  // =====================================================
  // Get Farm By ID
  // =====================================================

  async getFarmById(
    id: string
  ): Promise<Farm | undefined> {

    const {
      data,
      error
    } = await this.supabaseService.client
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

    return this.mapFarm(data);

  }


  // =====================================================
  // Add Farm
  // =====================================================

  async addFarm(
    farmData: CreateFarmData
  ): Promise<Farm> {

    // Get authenticated user
    const {
      data: {
        user
      },
      error: userError
    } = await this.supabaseService.client.auth.getUser();


    if (userError) {
      throw userError;
    }


    if (!user) {
      throw new Error(
        'You must be logged in to create a farm.'
      );
    }


    // Insert into Supabase
    const {
      data,
      error
    } = await this.supabaseService.client
      .from('farms')
      .insert({

        owner_id: user.id,

        name: farmData.name,

        latitude:
          farmData.latitude ?? null,

        longitude:
          farmData.longitude ?? null,

        area:
          farmData.area ?? null

      })
      .select()
      .single();


    if (error) {

      console.error(
        'Failed to create farm:',
        error
      );

      throw error;

    }


    return this.mapFarm(data);

  }


  // =====================================================
  // Update Farm
  // =====================================================

  async updateFarm(
    id: string,
    farmData: Partial<CreateFarmData>
  ): Promise<Farm> {

    const {
      data,
      error
    } = await this.supabaseService.client
      .from('farms')
      .update({

        name:
          farmData.name,

        latitude:
          farmData.latitude ?? null,

        longitude:
          farmData.longitude ?? null,

        area:
          farmData.area ?? null

      })
      .eq('id', id)
      .select()
      .single();


    if (error) {

      console.error(
        'Failed to update farm:',
        error
      );

      throw error;

    }


    return this.mapFarm(data);

  }


  // =====================================================
  // Delete Farm
  // =====================================================

  async deleteFarm(
    id: string
  ): Promise<void> {

    const {
      error
    } = await this.supabaseService.client
      .from('farms')
      .delete()
      .eq('id', id);


    if (error) {

      console.error(
        'Failed to delete farm:',
        error
      );

      throw error;

    }

  }


  // =====================================================
  // Map Supabase → Angular Model
  // =====================================================

  private mapFarm(
    data: any
  ): Farm {

    return {

      id: data.id,

      name: data.name,

      // Temporary until we have a dedicated
      // location field in Supabase.
      location: 'Fayoum, Egypt',

      latitude:
        data.latitude ?? undefined,

      longitude:
        data.longitude ?? undefined,

      area:
        data.area ?? undefined,

      // Supabase currently does not have areaUnit.
      areaUnit: 'acre',

      // Supabase currently does not have status.
      status: 'active',

      // These will come from related tables later.
      zonesCount: 0,

      cropsCount: 0,

      livestockCount: 0,

      createdAt:
        data.created_at ?? undefined,

      updatedAt:
        data.updated_at ?? undefined

    };

  }

}