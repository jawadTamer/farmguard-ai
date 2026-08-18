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
  private readonly providerMode: 'mock' | 'fortyguard' = 'fortyguard';
  private provider: TemperatureProvider;

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

  private temperatureHistory: TemperatureReading[] = [];

  constructor(private readonly supabaseService: SupabaseService) {
    this.provider = this.createProvider(this.providerMode);
  }

  async getCurrentTemperature(farmId?: string, zoneId?: string): Promise<TemperatureReading> {
    if (!farmId || farmId.trim() === '') {
      throw new Error('Farm ID is required to get current temperature.');
    }

    const result = await this.provider.getCurrentTemperature(farmId, zoneId);
    if (result) {
      return result;
    }

    throw new Error('No current temperature was returned by the active provider.');
  }

  async saveTemperatureReading(reading: TemperatureReading): Promise<void> {
    try {
      await this.provider.saveTemperatureReading(reading);
    } catch (error) {
      console.error(`Provider (${this.provider.providerName}) failed to save:`, error);
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

    return [
      { timestamp: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), temperature: 37, feelsLike: 39, humidity: 42, condition: 'Sunny' },
      { timestamp: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), temperature: 41, feelsLike: 43, humidity: 38, condition: 'Hot' },
      { timestamp: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString(), temperature: 34, feelsLike: 35, humidity: 48, condition: 'Clear' },
      { timestamp: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), temperature: 30, feelsLike: 31, humidity: 55, condition: 'Clear' }
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

    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      let query = this.supabaseService.client
        .from('temperature_readings')
        .select('*')
        .gte('recorded_at', cutoffDate)
        .order('recorded_at', { ascending: false });

      if (farmId) query = query.eq('farm_id', farmId);
      if (zoneId) query = query.eq('zone_id', zoneId);

      const { data, error } = await query;
      if (data && !error) {
        return data.map(reading => ({
          id: reading.id,
          farmId: reading.farm_id,
          zoneId: reading.zone_id,
          temperature: Number(reading.temperature),
          feelsLike: reading.feels_like == null ? undefined : Number(reading.feels_like),
          humidity: reading.humidity == null ? undefined : Number(reading.humidity),
          recordedAt: reading.recorded_at,
          source: reading.source || 'api'
        }));
      }
    } catch (error) {
      console.error('Failed to fetch temperature history from Supabase:', error);
    }

    return this.temperatureHistory;
  }

  getProviderName(): string {
    return this.provider.providerName;
  }

  switchProvider(mode: 'mock' | 'fortyguard'): void {
    this.provider = this.createProvider(mode);
    console.log(`Switched to ${this.provider.providerName}`);
  }

  private createProvider(mode: 'mock' | 'fortyguard'): TemperatureProvider {
    return mode === 'fortyguard'
      ? new FortyGuardTemperatureProvider(this.supabaseService)
      : new MockTemperatureProvider(this.supabaseService);
  }
}
