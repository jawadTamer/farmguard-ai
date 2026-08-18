import { TemperatureProvider } from './temperature-provider.interface';
import { TemperatureReading, TemperatureForecast } from '../models/temperature.model';
import { SupabaseService } from '../services/supabase.service';

export class MockTemperatureProvider implements TemperatureProvider {
  readonly providerName = 'MockTemperatureProvider';

  constructor(private supabaseService: SupabaseService) {}

  async getCurrentTemperature(farmId: string, zoneId?: string): Promise<TemperatureReading | null> {
    // Try to get from Supabase first, fall back to mock data
    try {
      const { data, error } = await this.supabaseService.client
        .from('temperature_readings')
        .select('*')
        .eq('farm_id', farmId)
        .eq('zone_id', zoneId || null)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single();

      if (data && !error) {
        return this.mapToTemperatureReading(data);
      }
    } catch (e) {
      console.warn('Failed to fetch from Supabase, using mock data:', e);
    }

    // Mock data fallback
    return this.getMockCurrentTemperature();
  }

  async getTemperatureHistory(farmId: string, zoneId?: string, days: number = 7): Promise<TemperatureReading[]> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('temperature_readings')
        .select('*')
        .eq('farm_id', farmId)
        .eq('zone_id', zoneId || null)
        .gte('recorded_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
        .order('recorded_at', { ascending: false });

      if (data && !error) {
        return data.map(item => this.mapToTemperatureReading(item));
      }
    } catch (e) {
      console.warn('Failed to fetch history from Supabase, using mock data:', e);
    }

    // Mock data fallback
    return this.getMockTemperatureHistory();
  }

  async getForecast(farmId: string, zoneId?: string): Promise<TemperatureForecast[]> {
    // Mock forecast data
    return this.getMockForecast();
  }

  async saveTemperatureReading(reading: TemperatureReading): Promise<void> {
    try {
      const { error } = await this.supabaseService.client
        .from('temperature_readings')
        .insert({
          farm_id: reading.farmId,
          zone_id: reading.zoneId,
          temperature: reading.temperature,
          feels_like: reading.feelsLike,
          humidity: reading.humidity,
          source: reading.source,
          recorded_at: reading.recordedAt
        });

      if (error) {
        console.error('Failed to save temperature reading:', error);
        throw error;
      }
    } catch (e) {
      console.error('Error saving temperature reading:', e);
      throw e;
    }
  }

  private mapToTemperatureReading(data: any): TemperatureReading {
    return {
      id: data.id,
      farmId: data.farm_id,
      zoneId: data.zone_id,
      temperature: data.temperature,
      feelsLike: data.feels_like,
      humidity: data.humidity,
      source: data.source,
      recordedAt: data.recorded_at
    };
  }

  private getMockCurrentTemperature(): TemperatureReading {
    return {
      id: 'mock-1',
      farmId: 'mock-farm',
      zoneId: 'mock-zone',
      temperature: 32,
      feelsLike: 35,
      humidity: 65,
      source: 'mock',
      recordedAt: new Date().toISOString()
    };
  }

  private getMockTemperatureHistory(): TemperatureReading[] {
    const history: TemperatureReading[] = [];
    const now = new Date();
    
    for (let i = 0; i < 24; i++) {
      const time = new Date(now.getTime() - i * 60 * 60 * 1000);
      history.push({
        id: `mock-history-${i}`,
        farmId: 'mock-farm',
        zoneId: 'mock-zone',
        temperature: 28 + Math.random() * 8,
        feelsLike: 30 + Math.random() * 8,
        humidity: 50 + Math.random() * 30,
        source: 'mock',
        recordedAt: time.toISOString()
      });
    }

    return history;
  }

  private getMockForecast(): TemperatureForecast[] {
    const forecast: TemperatureForecast[] = [];
    const now = new Date();
    
    for (let i = 1; i <= 24; i++) {
      const time = new Date(now.getTime() + i * 60 * 60 * 1000);
      const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Hot'];
      forecast.push({
        timestamp: time.toISOString(),
        temperature: 30 + Math.random() * 10,
        feelsLike: 32 + Math.random() * 10,
        humidity: 40 + Math.random() * 40,
        condition: conditions[Math.floor(Math.random() * conditions.length)]
      });
    }

    return forecast;
  }
}
