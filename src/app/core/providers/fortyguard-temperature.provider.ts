import { TemperatureProvider } from './temperature-provider.interface';
import { TemperatureReading, TemperatureForecast, TemperatureDiagnostics } from '../models/temperature.model';
import { SupabaseService } from '../services/supabase.service';

export interface TemperatureTrendPoint {
  timestamp: string;
  temperature: number;
  apparentTemperature?: number;
  heatIndex?: number;
  humidity?: number;
}

interface FortyGuardCurrentResponse {
  temperature: number | null;
  feelsLike?: number | null;
  humidity?: number | null;
  heatIndex?: number | null;
  wetBulbTemperature?: number | null;
  precipitation?: number | null;
  cloudCover?: number | null;
  aqi?: number | null;
  solarIrradiance?: unknown;
  recordedAt?: string;
  coordinates?: { latitude: number; longitude: number };
  heatmapActivityId?: string;
  environmentalActivityId?: string;
  nCells?: number;
  featuresCount?: number;
  resultKeys?: string[];
  statsKeys?: string[];
  environmentalError?: unknown;
}

interface FortyGuardResponse<T = FortyGuardCurrentResponse> {
  success: boolean;
  action?: string;
  data?: T;
  error?: string;
  message?: string;
  status?: number;
  endpoint?: string;
}

interface FortyGuardTrendResponse {
  activityId?: string;
  date?: string;
  metric?: string;
  points?: Array<{
    timestamp?: string | null;
    temperature?: number | null;
    apparentTemperature?: number | null;
    heatIndex?: number | null;
    humidity?: number | null;
  }>;
}

export class FortyGuardTemperatureProvider implements TemperatureProvider {
  readonly providerName = 'FortyGuardTemperatureProvider';

  constructor(private readonly supabaseService: SupabaseService) {}

  async getCurrentTemperature(farmId: string, zoneId?: string): Promise<TemperatureReading | null> {
    if (!farmId?.trim()) throw new Error('Farm ID is required to get current temperature.');
    const coordinates = await this.getCoordinates(farmId, zoneId);
    if (!coordinates) throw new Error('No latitude/longitude is configured for this farm or zone.');

    const { data, error } = await this.supabaseService.client.functions.invoke<FortyGuardResponse>('fortyguard-proxy', {
      body: { action: 'current-temperature', latitude: coordinates.latitude, longitude: coordinates.longitude },
    });
    if (error) throw new Error(await this.formatFunctionError(error));
    if (!data?.success || !data.data) throw new Error(data?.message ?? data?.error ?? 'Invalid FortyGuard response.');

    const current = data.data;
    if (!this.isFiniteNumber(current.temperature)) {
      throw new Error(`FortyGuard completed but no valid temperature was returned.${typeof current.environmentalError === 'string' ? ` ${current.environmentalError}` : ''}`);
    }

    const diagnostics: TemperatureDiagnostics = {
      status: 'Completed', resultReceived: true,
      heatmapActivityId: current.heatmapActivityId,
      environmentalActivityId: current.environmentalActivityId,
      resultKeys: current.resultKeys, statsKeys: current.statsKeys,
      nCells: current.nCells, featuresCount: current.featuresCount,
    };

    const reading: TemperatureReading = {
      farmId, zoneId, temperature: Number(current.temperature),
      feelsLike: this.toNumber(current.feelsLike), humidity: this.toNumber(current.humidity),
      heatIndex: this.toNumber(current.heatIndex), wetBulbTemperature: this.toNumber(current.wetBulbTemperature),
      precipitation: this.toNumber(current.precipitation), cloudCover: this.toNumber(current.cloudCover),
      aqi: this.toNumber(current.aqi), solarIrradiance: current.solarIrradiance ?? null,
      recordedAt: current.recordedAt ?? new Date().toISOString(), source: 'api', diagnostics,
    };

    await this.saveTemperatureReading(reading);
    return reading;
  }

  async getTodayTemperatureTrend(farmId: string, zoneId?: string, currentTemperature?: number): Promise<TemperatureTrendPoint[]> {
    if (!farmId?.trim()) throw new Error('Farm ID is required to get the temperature trend.');
    const coordinates = await this.getCoordinates(farmId, zoneId);
    if (!coordinates) throw new Error('No latitude/longitude is configured for this farm or zone.');

    const temperature = this.isFiniteNumber(currentTemperature)
      ? Number(currentTemperature)
      : (await this.getCurrentTemperature(farmId, zoneId))?.temperature;
    if (!this.isFiniteNumber(temperature)) throw new Error('A valid temperature is required to request the FortyGuard trend.');

    const { data, error } = await this.supabaseService.client.functions.invoke<FortyGuardResponse<FortyGuardTrendResponse>>('fortyguard-proxy', {
      body: {
        action: 'temperature-trend',
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        temperature: Number(temperature),
      },
    });
    if (error) throw new Error(await this.formatFunctionError(error));
    if (!data?.success || !data.data) throw new Error(data?.message ?? data?.error ?? 'Invalid FortyGuard trend response.');

    return (data.data.points ?? [])
      .filter((point) => typeof point.timestamp === 'string' && this.isFiniteNumber(point.temperature))
      .map((point) => ({
        timestamp: point.timestamp!,
        temperature: Number(point.temperature),
        apparentTemperature: this.toNumber(point.apparentTemperature),
        heatIndex: this.toNumber(point.heatIndex),
        humidity: this.toNumber(point.humidity),
      }));
  }

  async getTemperatureHistory(farmId: string, zoneId?: string, days: number = 7): Promise<TemperatureReading[]> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    let query = this.supabaseService.client.from('temperature_readings').select('*').eq('farm_id', farmId).gte('recorded_at', cutoffDate).order('recorded_at', { ascending: false });
    if (zoneId) query = query.eq('zone_id', zoneId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((reading) => ({
      id: reading.id, farmId: reading.farm_id, zoneId: reading.zone_id,
      temperature: Number(reading.temperature), feelsLike: this.toNumber(reading.apparent_temperature),
      humidity: this.toNumber(reading.humidity), heatIndex: this.toNumber(reading.heat_index),
      wetBulbTemperature: this.toNumber(reading.wet_bulb_temperature), recordedAt: reading.recorded_at,
      source: reading.source || 'api',
    }));
  }

  async getForecast(_farmId: string, _zoneId?: string): Promise<TemperatureForecast[]> { return []; }

  async saveTemperatureReading(reading: TemperatureReading): Promise<void> {
    const { error } = await this.supabaseService.client.from('temperature_readings').insert({
      farm_id: reading.farmId, zone_id: reading.zoneId, temperature: reading.temperature,
      apparent_temperature: reading.feelsLike, humidity: reading.humidity, heat_index: reading.heatIndex,
      wet_bulb_temperature: reading.wetBulbTemperature, source: reading.source ?? 'api', recorded_at: reading.recordedAt,
      raw_data: { diagnostics: reading.diagnostics ?? null, precipitation: reading.precipitation ?? null, cloudCover: reading.cloudCover ?? null, aqi: reading.aqi ?? null, solarIrradiance: reading.solarIrradiance ?? null },
    });
    if (error) throw error;
  }

  private async formatFunctionError(error: any): Promise<string> {
    let detail = '';
    try {
      const response = error?.context as Response | undefined;
      if (response) {
        const body = await response.clone().json().catch(() => null);
        if (body) detail = ` | ${JSON.stringify(body)}`;
      }
    } catch {}
    return `FortyGuard Edge Function error: ${error?.message || 'Unknown error'}${detail}`;
  }

  private async getCoordinates(farmId: string, zoneId?: string): Promise<{ latitude: number; longitude: number } | null> {
    if (zoneId?.trim()) {
      const { data: zone, error } = await this.supabaseService.client.from('farm_zones').select('latitude, longitude').eq('id', zoneId).eq('farm_id', farmId).maybeSingle();
      if (error) throw error;
      if (this.validCoordinates(zone?.latitude, zone?.longitude)) return { latitude: Number(zone!.latitude), longitude: Number(zone!.longitude) };
    }
    const { data: farm, error } = await this.supabaseService.client.from('farms').select('latitude, longitude').eq('id', farmId).maybeSingle();
    if (error) throw error;
    if (!this.validCoordinates(farm?.latitude, farm?.longitude)) return null;
    return { latitude: Number(farm!.latitude), longitude: Number(farm!.longitude) };
  }

  private validCoordinates(latitude: unknown, longitude: unknown): boolean {
    const lat = Number(latitude), lon = Number(longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }
  private isFiniteNumber(value: unknown): value is number { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)); }
  private toNumber(value: unknown): number | undefined { return this.isFiniteNumber(value) ? Number(value) : undefined; }
}