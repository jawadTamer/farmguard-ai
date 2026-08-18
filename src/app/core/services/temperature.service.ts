import { Injectable } from '@angular/core';
import {
  TemperatureForecast,
  TemperatureReading
} from '../models/temperature.model';
import { SupabaseService } from './supabase.service';
import { TemperatureProvider } from '../providers/temperature-provider.interface';
import { MockTemperatureProvider } from '../providers/mock-temperature.provider';
import { FortyGuardTemperatureProvider } from '../providers/fortyguard-temperature.provider';

@Injectable({
  providedIn: 'root'
})
export class TemperatureService {
  // Provider configuration - set to 'mock' or 'fortyguard'
  private readonly providerMode: 'mock' | 'fortyguard' = 'mock';
  
  private provider: TemperatureProvider;

  // Legacy mock data for fallback
  private currentTemperature: TemperatureReading = {
    id: 'temp-001',
    farmId: 'farm-001',
    zoneId: 'zone-001',

    temperature: 41,
    feelsLike: 43,
    humidity: 38,

    recordedAt: new Date().toISOString(),

    source: 'mock'
  };

  private temperatureHistory: TemperatureReading[] = [
    {
      id: 'temp-hist-001',
      farmId: 'farm-001',
      zoneId: 'zone-001',
      temperature: 38,
      feelsLike: 40,
      humidity: 42,
      recordedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      source: 'mock'
    },
    {
      id: 'temp-hist-002',
      farmId: 'farm-001',
      zoneId: 'zone-001',
      temperature: 39,
      feelsLike: 41,
      humidity: 40,
      recordedAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
      source: 'mock'
    },
    {
      id: 'temp-hist-003',
      farmId: 'farm-001',
      zoneId: 'zone-001',
      temperature: 40,
      feelsLike: 42,
      humidity: 39,
      recordedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      source: 'mock'
    },
    {
      id: 'temp-hist-004',
      farmId: 'farm-001',
      zoneId: 'zone-001',
      temperature: 41,
      feelsLike: 43,
      humidity: 38,
      recordedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      source: 'mock'
    },
    {
      id: 'temp-hist-005',
      farmId: 'farm-001',
      zoneId: 'zone-001',
      temperature: 41,
      feelsLike: 43,
      humidity: 38,
      recordedAt: new Date().toISOString(),
      source: 'mock'
    }
  ];

  constructor(private supabaseService: SupabaseService) {
    // Initialize provider based on configuration
    if (this.providerMode === 'fortyguard') {
      this.provider = new FortyGuardTemperatureProvider(this.supabaseService, null as any);
    } else {
      this.provider = new MockTemperatureProvider(this.supabaseService);
    }
  }

  async getCurrentTemperature(farmId?: string, zoneId?: string): Promise<TemperatureReading> {
    try {
      const result = await this.provider.getCurrentTemperature(farmId || '', zoneId);
      if (result) {
        return result;
      }
    } catch (error) {
      console.error(`Provider (${this.provider.providerName}) failed, using fallback:`, error);
    }
    
    // Fallback to legacy mock data
    return this.currentTemperature;
  }

  async saveTemperatureReading(reading: TemperatureReading): Promise<void> {
    try {
      await this.provider.saveTemperatureReading(reading);
    } catch (error) {
      console.error(`Provider (${this.provider.providerName}) failed to save:`, error);
      // Try direct Supabase save as fallback
      try {
        const { error } = await this.supabaseService.client
          .from('temperature_readings')
          .insert({
            farm_id: reading.farmId,
            zone_id: reading.zoneId,
            temperature: reading.temperature,
            feels_like: reading.feelsLike,
            humidity: reading.humidity,
            recorded_at: reading.recordedAt,
            source: reading.source || 'mock'
          });

        if (error) {
          console.error('Fallback save also failed:', error);
        }
      } catch (fallbackError) {
        console.error('Fallback save error:', fallbackError);
      }
    }
  }

  async getForecast(farmId?: string, zoneId?: string): Promise<TemperatureForecast[]> {
    try {
      const result = await this.provider.getForecast(farmId || '', zoneId);
      if (result.length > 0) {
        return result;
      }
    } catch (error) {
      console.error(`Provider (${this.provider.providerName}) failed, using fallback:`, error);
    }
    
    // Fallback to legacy mock data
    return [
      {
        timestamp: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        temperature: 37,
        feelsLike: 39,
        humidity: 42,
        condition: 'Sunny'
      },
      {
        timestamp: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        temperature: 41,
        feelsLike: 43,
        humidity: 38,
        condition: 'Hot'
      },
      {
        timestamp: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString(),
        temperature: 34,
        feelsLike: 35,
        humidity: 48,
        condition: 'Clear'
      },
      {
        timestamp: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        temperature: 30,
        feelsLike: 31,
        humidity: 55,
        condition: 'Clear'
      }
    ];
  }

  async getTemperatureHistory(farmId?: string, zoneId?: string, days: number = 7): Promise<TemperatureReading[]> {
    try {
      const result = await this.provider.getTemperatureHistory(farmId || '', zoneId, days);
      if (result.length > 0) {
        return result;
      }
    } catch (error) {
      console.error(`Provider (${this.provider.providerName}) failed, using fallback:`, error);
    }
    
    // Fallback to legacy implementation
    try {
      if (farmId || zoneId) {
        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await this.supabaseService.client
          .from('temperature_readings')
          .select('*')
          .eq('farm_id', farmId || '')
          .eq('zone_id', zoneId || '')
          .gte('recorded_at', cutoffDate)
          .order('recorded_at', { ascending: false });

        if (data && !error) {
          return data.map(reading => ({
            id: reading.id,
            farmId: reading.farm_id,
            zoneId: reading.zone_id,
            temperature: reading.temperature,
            feelsLike: reading.feels_like,
            humidity: reading.humidity,
            recordedAt: reading.recorded_at,
            source: reading.source || 'api'
          }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch temperature history from Supabase:', error);
    }

    let history = this.temperatureHistory;

    if (farmId || zoneId) {
      history = history.filter(
        t => (!farmId || t.farmId === farmId) && (!zoneId || t.zoneId === zoneId)
      );
    }

    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return history.filter(t => new Date(t.recordedAt) >= cutoffDate);
  }

  /**
   * Get the current provider name (useful for debugging)
   */
  getProviderName(): string {
    return this.provider.providerName;
  }

  /**
   * Switch provider at runtime (useful for testing)
   */
  switchProvider(mode: 'mock' | 'fortyguard'): void {
    if (mode === 'fortyguard') {
      this.provider = new FortyGuardTemperatureProvider(this.supabaseService, null as any);
    } else {
      this.provider = new MockTemperatureProvider(this.supabaseService);
    }
    console.log(`Switched to ${this.provider.providerName}`);
  }
}