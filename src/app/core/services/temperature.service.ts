import { Injectable } from '@angular/core';
import { TemperatureForecast, TemperatureReading } from '../models/temperature.model';
import { SupabaseService } from './supabase.service';
import { TemperatureProvider } from '../providers/temperature-provider.interface';
import { MockTemperatureProvider } from '../providers/mock-temperature.provider';
import { FortyGuardTemperatureProvider, TemperatureTrendPoint } from '../providers/fortyguard-temperature.provider';

@Injectable({ providedIn: 'root' })
export class TemperatureService {
  private readonly providerMode: 'mock' | 'fortyguard' = 'fortyguard';
  private provider: TemperatureProvider;
  private temperatureHistory: TemperatureReading[] = [];

  constructor(private readonly supabaseService: SupabaseService) {
    this.provider = this.createProvider(this.providerMode);
  }

  async getCurrentTemperature(farmId?: string, zoneId?: string): Promise<TemperatureReading> {
    if (!farmId?.trim()) throw new Error('Farm ID is required to get current temperature.');
    const result = await this.provider.getCurrentTemperature(farmId, zoneId);
    if (!result) throw new Error('No current temperature was returned by the active provider.');
    return result;
  }

  async getTodayTemperatureTrend(farmId?: string, zoneId?: string, currentTemperature?: number): Promise<TemperatureTrendPoint[]> {
    if (!farmId?.trim()) throw new Error('Farm ID is required to get the temperature trend.');
    if (this.provider instanceof FortyGuardTemperatureProvider) {
      return this.provider.getTodayTemperatureTrend(farmId, zoneId, currentTemperature);
    }
    const history = await this.getTemperatureHistory(farmId, zoneId, 1);
    return history
      .filter((reading) => Number.isFinite(Number(reading.temperature)))
      .map((reading) => ({ timestamp: reading.recordedAt, temperature: Number(reading.temperature), apparentTemperature: reading.feelsLike, heatIndex: reading.heatIndex, humidity: reading.humidity }));
  }

  async saveTemperatureReading(reading: TemperatureReading): Promise<void> {
    try { await this.provider.saveTemperatureReading(reading); }
    catch (error) { console.error(`Provider (${this.provider.providerName}) failed to save:`, error); }
  }

  async getForecast(farmId?: string, zoneId?: string): Promise<TemperatureForecast[]> {
    try {
      const result = await this.provider.getForecast(farmId || '', zoneId);
      if (result.length) return result;
    } catch (error) { console.error(`Provider (${this.provider.providerName}) failed to load forecast:`, error); }
    return [];
  }

  async getTemperatureHistory(farmId?: string, zoneId?: string, days = 7): Promise<TemperatureReading[]> {
    try {
      const result = await this.provider.getTemperatureHistory(farmId || '', zoneId, days);
      if (result.length) return result;
    } catch (error) { console.error(`Provider (${this.provider.providerName}) failed to load history:`, error); }

    try {
      const cutoffDate = new Date(Date.now() - days * 86400000).toISOString();
      let query = this.supabaseService.client.from('temperature_readings').select('*').gte('recorded_at', cutoffDate).order('recorded_at', { ascending: false });
      if (farmId) query = query.eq('farm_id', farmId);
      if (zoneId) query = query.eq('zone_id', zoneId);
      const { data, error } = await query;
      if (data && !error) return data.map((reading) => ({
        id: reading.id, farmId: reading.farm_id, zoneId: reading.zone_id, temperature: Number(reading.temperature),
        feelsLike: reading.feels_like == null ? undefined : Number(reading.feels_like),
        humidity: reading.humidity == null ? undefined : Number(reading.humidity), recordedAt: reading.recorded_at, source: reading.source || 'api',
      }));
    } catch (error) { console.error('Failed to fetch temperature history from Supabase:', error); }
    return this.temperatureHistory;
  }

  getProviderName(): string { return this.provider.providerName; }
  switchProvider(mode: 'mock' | 'fortyguard'): void { this.provider = this.createProvider(mode); }
  private createProvider(mode: 'mock' | 'fortyguard'): TemperatureProvider {
    return mode === 'fortyguard' ? new FortyGuardTemperatureProvider(this.supabaseService) : new MockTemperatureProvider(this.supabaseService);
  }
}