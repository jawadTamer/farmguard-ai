import { TemperatureProvider } from './temperature-provider.interface';
import { TemperatureReading, TemperatureForecast, TemperatureDiagnostics } from '../models/temperature.model';
import { SupabaseService } from '../services/supabase.service';

interface FortyGuardCurrentResponse {
  temperature: number;
  feelsLike?: number | null;
  humidity?: number | null;
  heatIndex?: number | null;
  wetBulbTemperature?: number | null;
  precipitation?: number | null;
  cloudCover?: number | null;
  aqi?: number | null;
  solarIrradiance?: unknown;
  recordedAt: string;
  coordinates?: { latitude: number; longitude: number };
  heatmapActivityId?: string;
  environmentalActivityId?: string;
  nCells?: number;
  featuresCount?: number;
  resultKeys?: string[];
  statsKeys?: string[];
}

interface FortyGuardResponse {
  success: boolean;
  action?: string;
  data?: FortyGuardCurrentResponse;
  error?: string;
  message?: string;
  status?: number;
  endpoint?: string;
  diagnostics?: TemperatureDiagnostics;
}

export class FortyGuardTemperatureProvider implements TemperatureProvider {
  readonly providerName = 'FortyGuardTemperatureProvider';

  constructor(private readonly supabaseService: SupabaseService) {}

  async getCurrentTemperature(farmId: string, zoneId?: string): Promise<TemperatureReading | null> {
    if (!farmId?.trim()) throw new Error('Farm ID is required to get current temperature.');

    const coordinates = await this.getCoordinates(farmId, zoneId);
    if (!coordinates) throw new Error('No latitude/longitude is configured for this farm or zone.');

    console.log('[FortyGuard] Requesting current temperature', { farmId, zoneId, coordinates });

    const { data, error } = await this.supabaseService.client.functions.invoke<FortyGuardResponse>('fortyguard-proxy', {
      body: {
        action: 'current-temperature',
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      },
    });

    if (error) {
      console.error('[FortyGuard] Edge Function invocation failed:', error);
      throw new Error(`FortyGuard Edge Function error: ${error.message || 'Unknown error'}`);
    }

    console.log('[FortyGuard] Proxy response:', data);

    if (!data?.success || !data?.data) {
      const message = data?.message ?? data?.error ?? 'Invalid FortyGuard response.';
      throw new Error(`FortyGuard API error: ${message}${data?.status ? ` (HTTP ${data.status})` : ''}${data?.endpoint ? ` - ${data.endpoint}` : ''}`);
    }

    const current = data.data;
    if (!Number.isFinite(Number(current.temperature))) {
      throw new Error('FortyGuard completed successfully but returned an invalid temperature.');
    }

    const diagnostics: TemperatureDiagnostics = {
      status: 'Completed',
      resultReceived: true,
      heatmapActivityId: current.heatmapActivityId,
      environmentalActivityId: current.environmentalActivityId,
      resultKeys: current.resultKeys,
      statsKeys: current.statsKeys,
      nCells: current.nCells,
      featuresCount: current.featuresCount,
    };

    const reading: TemperatureReading = {
      farmId,
      zoneId,
      temperature: Number(current.temperature),
      feelsLike: this.toNumber(current.feelsLike),
      humidity: this.toNumber(current.humidity),
      heatIndex: this.toNumber(current.heatIndex),
      wetBulbTemperature: this.toNumber(current.wetBulbTemperature),
      precipitation: this.toNumber(current.precipitation),
      cloudCover: this.toNumber(current.cloudCover),
      aqi: this.toNumber(current.aqi),
      solarIrradiance: current.solarIrradiance ?? null,
      recordedAt: current.recordedAt ?? new Date().toISOString(),
      source: 'api',
      diagnostics,
    };

    console.log('[FortyGuard] Completed result mapped to TemperatureReading:', reading);

    await this.saveTemperatureReading(reading);
    return reading;
  }

  async getTemperatureHistory(farmId: string, zoneId?: string, days: number = 7): Promise<TemperatureReading[]> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    let query = this.supabaseService.client
      .from('temperature_readings')
      .select('*')
      .eq('farm_id', farmId)
      .gte('recorded_at', cutoffDate)
      .order('recorded_at', { ascending: false });

    if (zoneId) query = query.eq('zone_id', zoneId);

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((reading) => ({
      id: reading.id,
      farmId: reading.farm_id,
      zoneId: reading.zone_id,
      temperature: Number(reading.temperature),
      feelsLike: this.toNumber(reading.apparent_temperature),
      humidity: this.toNumber(reading.humidity),
      heatIndex: this.toNumber(reading.heat_index),
      wetBulbTemperature: this.toNumber(reading.wet_bulb_temperature),
      recordedAt: reading.recorded_at,
      source: reading.source || 'api',
    }));
  }

  async getForecast(_farmId: string, _zoneId?: string): Promise<TemperatureForecast[]> {
    return [];
  }

  async saveTemperatureReading(reading: TemperatureReading): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('temperature_readings')
      .insert({
        farm_id: reading.farmId,
        zone_id: reading.zoneId,
        temperature: reading.temperature,
        apparent_temperature: reading.feelsLike,
        humidity: reading.humidity,
        heat_index: reading.heatIndex,
        wet_bulb_temperature: reading.wetBulbTemperature,
        source: reading.source ?? 'api',
        recorded_at: reading.recordedAt,
        raw_data: {
          diagnostics: reading.diagnostics ?? null,
          precipitation: reading.precipitation ?? null,
          cloudCover: reading.cloudCover ?? null,
          aqi: reading.aqi ?? null,
          solarIrradiance: reading.solarIrradiance ?? null,
        },
      });

    if (error) throw error;
  }

  async getEnvironmentalParameters(farmId: string, zoneId?: string, temperature?: number): Promise<Record<string, unknown>> {
    const coordinates = await this.getCoordinates(farmId, zoneId);
    if (!coordinates) throw new Error('No latitude/longitude is configured for this farm or zone.');

    const currentTemperature = temperature ?? (await this.getCurrentTemperature(farmId, zoneId))?.temperature;
    if (!Number.isFinite(Number(currentTemperature))) throw new Error('A valid temperature is required for environmental parameters.');

    const { data, error } = await this.supabaseService.client.functions.invoke('fortyguard-proxy', {
      body: {
        action: 'environmental-parameters',
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        temperature: Number(currentTemperature),
      },
    });

    if (error) throw new Error(`FortyGuard Edge Function error: ${error.message}`);
    if (!data?.success || !data?.data) throw new Error(data?.message ?? data?.error ?? 'Invalid environmental response.');
    return data.data;
  }

  private async getCoordinates(farmId: string, zoneId?: string): Promise<{ latitude: number; longitude: number } | null> {
    if (!farmId?.trim()) return null;

    if (zoneId?.trim()) {
      const { data: zone, error } = await this.supabaseService.client
        .from('farm_zones')
        .select('latitude, longitude')
        .eq('id', zoneId)
        .eq('farm_id', farmId)
        .maybeSingle();
      if (error) throw error;
      if (this.validCoordinates(zone?.latitude, zone?.longitude)) {
        return { latitude: Number(zone!.latitude), longitude: Number(zone!.longitude) };
      }
    }

    const { data: farm, error } = await this.supabaseService.client
      .from('farms')
      .select('latitude, longitude')
      .eq('id', farmId)
      .maybeSingle();
    if (error) throw error;
    if (!this.validCoordinates(farm?.latitude, farm?.longitude)) return null;

    return { latitude: Number(farm!.latitude), longitude: Number(farm!.longitude) };
  }

  private validCoordinates(latitude: unknown, longitude: unknown): boolean {
    const lat = Number(latitude);
    const lon = Number(longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }

  private toNumber(value: unknown): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
}
