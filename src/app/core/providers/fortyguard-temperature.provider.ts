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
  feelsLike?: number | null; humidity?: number | null; heatIndex?: number | null;
  wetBulbTemperature?: number | null; precipitation?: number | null; cloudCover?: number | null;
  aqi?: number | null; solarIrradiance?: unknown; recordedAt?: string;
  coordinates?: { latitude: number; longitude: number }; heatmapActivityId?: string;
  environmentalActivityId?: string; nCells?: number; featuresCount?: number;
  resultKeys?: string[]; statsKeys?: string[]; environmentalError?: unknown;
}
interface TrendActivity { activityId: string; timestamp: string; startDate: string; startTime: string; }
interface FortyGuardTrendResponse {
  phase?: string;
  activities?: TrendActivity[];
  points?: Array<{ timestamp: string; temperature: number | null; apparentTemperature?: number | null; heatIndex?: number | null; humidity?: number | null }>;
  requestedHours?: number; returnedHours?: number; completed?: number; processing?: number; failed?: number; done?: boolean;
  resultReceived?: boolean; source?: string;
}
interface FortyGuardResponse<T = FortyGuardCurrentResponse> {
  success: boolean; action?: string; data?: T; error?: string; message?: string; status?: number; endpoint?: string;
}

export class FortyGuardTemperatureProvider implements TemperatureProvider {
  readonly providerName = 'FortyGuardTemperatureProvider';
  private static readonly REFRESH_AFTER_MS = 5 * 60 * 1000;
  private static readonly refreshInFlight = new Map<string, Promise<TemperatureReading | null>>();

  constructor(private readonly supabaseService: SupabaseService) {}

  async getCurrentTemperature(farmId: string, zoneId?: string): Promise<TemperatureReading | null> {
    if (!farmId?.trim()) throw new Error('Farm ID is required to get current temperature.');
    const cache = await this.getLatestCachedReading(farmId, zoneId);
    if (cache) {
      if (Date.now() - new Date(cache.recordedAt).getTime() >= FortyGuardTemperatureProvider.REFRESH_AFTER_MS) void this.refreshInBackground(farmId, zoneId);
      return cache;
    }
    return this.refreshFromFortyGuard(farmId, zoneId);
  }

  async refreshCurrentTemperature(farmId: string, zoneId?: string): Promise<TemperatureReading | null> { return this.refreshFromFortyGuard(farmId, zoneId); }

  /** Gets up to 12 hourly temperature values from separate asynchronous FortyGuard tcm activities. */
  async getTodayTemperatureTrend(farmId: string, zoneId?: string, _currentTemperature?: number): Promise<TemperatureTrendPoint[]> {
    if (!farmId?.trim()) throw new Error('Farm ID is required to get the temperature trend.');
    const coordinates = await this.getCoordinates(farmId, zoneId);
    if (!coordinates) throw new Error('No latitude/longitude is configured for this farm or zone.');

    // Step 1: submit all hourly activities. The Edge Function returns immediately
    // with activity IDs instead of waiting for FortyGuard to finish processing.
    const submitted = await this.invokeTrend({
      action: 'temperature-trend',
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      hours: 12,
    });

    const activities = submitted?.data?.activities ?? [];
    if (!activities.length) throw new Error('FortyGuard accepted the trend request but returned no activity IDs.');

    // Step 2: poll status from the browser. Each status request is short and the
    // Edge Function checks all activity IDs concurrently, avoiding a long-running
    // Supabase worker and the 546/WORKER_RESOURCE_LIMIT problem.
    const deadline = Date.now() + 120_000;
    let latest: FortyGuardResponse<FortyGuardTrendResponse> | null = null;

    while (Date.now() < deadline) {
      latest = await this.invokeTrendStatus(activities);
      const points = this.normalizeTrendPoints(latest?.data?.points ?? []);

      if (points.length >= Math.min(activities.length, 12) || latest?.data?.done) {
        if (points.length) return points;
        if (latest?.data?.done) break;
      }

      await this.sleep(3000);
    }

    // Return partial data if some activities completed. This is preferable to
    // throwing away successful hourly readings when one upstream job is slow.
    const partial = this.normalizeTrendPoints(latest?.data?.points ?? []);
    if (partial.length) return partial;

    throw new Error('FortyGuard trend activities are still processing. No hourly temperature result is available yet.');
  }

  async getTemperatureHistory(farmId: string, zoneId?: string, days = 7): Promise<TemperatureReading[]> {
    const cutoffDate = new Date(Date.now() - days * 86400000).toISOString();
    let query = this.supabaseService.client.from('temperature_readings').select('*').eq('farm_id', farmId).gte('recorded_at', cutoffDate).order('recorded_at', { ascending: false });
    if (zoneId) query = query.eq('zone_id', zoneId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(r => ({ id: r.id, farmId: r.farm_id, zoneId: r.zone_id, temperature: Number(r.temperature), feelsLike: this.toNumber(r.apparent_temperature), humidity: this.toNumber(r.humidity), heatIndex: this.toNumber(r.heat_index), wetBulbTemperature: this.toNumber(r.wet_bulb_temperature), recordedAt: r.recorded_at, source: r.source || 'api' }));
  }

  async getForecast(_farmId: string, _zoneId?: string): Promise<TemperatureForecast[]> { return []; }

  async saveTemperatureReading(reading: TemperatureReading): Promise<void> {
    const { error } = await this.supabaseService.client.from('temperature_readings').insert({
      farm_id: reading.farmId, zone_id: reading.zoneId, temperature: this.roundTemperature(reading.temperature),
      apparent_temperature: reading.feelsLike, humidity: reading.humidity, heat_index: reading.heatIndex,
      wet_bulb_temperature: reading.wetBulbTemperature, source: reading.source ?? 'api', recorded_at: reading.recordedAt,
      raw_data: { diagnostics: reading.diagnostics ?? null, precipitation: reading.precipitation ?? null, cloudCover: reading.cloudCover ?? null, aqi: reading.aqi ?? null, solarIrradiance: reading.solarIrradiance ?? null },
    });
    if (error) throw error;
  }

  private async invokeTrend(body: Record<string, unknown>): Promise<FortyGuardResponse<FortyGuardTrendResponse>> {
    const { data, error } = await this.supabaseService.client.functions.invoke<FortyGuardResponse<FortyGuardTrendResponse>>('fortyguard-proxy', { body });
    if (error) throw new Error(await this.formatFunctionError(error));
    if (!data?.success || !data.data) throw new Error(data?.message ?? data?.error ?? 'Invalid FortyGuard trend submission response.');
    return data;
  }

  private async invokeTrendStatus(activities: TrendActivity[]): Promise<FortyGuardResponse<FortyGuardTrendResponse>> {
    return this.invokeTrend({ action: 'temperature-trend-status', activities });
  }

  private normalizeTrendPoints(points: Array<{ timestamp: string; temperature: number | null; apparentTemperature?: number | null; heatIndex?: number | null; humidity?: number | null }>): TemperatureTrendPoint[] {
    return points
      .filter(p => this.isFiniteNumber(p.temperature))
      .map(p => ({
        timestamp: p.timestamp,
        temperature: this.roundTemperature(Number(p.temperature)),
        apparentTemperature: this.toNumber(p.apparentTemperature),
        heatIndex: this.toNumber(p.heatIndex),
        humidity: this.toNumber(p.humidity),
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  private sleep(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }

  private async refreshInBackground(farmId: string, zoneId?: string) { try { await this.refreshFromFortyGuard(farmId, zoneId); } catch (e) { console.warn('[FortyGuard] Background refresh failed; cached value remains available.', e); } }
  private async refreshFromFortyGuard(farmId: string, zoneId?: string): Promise<TemperatureReading | null> {
    const key = `${farmId}:${zoneId ?? 'farm'}`; const existing = FortyGuardTemperatureProvider.refreshInFlight.get(key); if (existing) return existing;
    const request = this.fetchAndSaveCurrentTemperature(farmId, zoneId).finally(() => FortyGuardTemperatureProvider.refreshInFlight.delete(key));
    FortyGuardTemperatureProvider.refreshInFlight.set(key, request); return request;
  }

  private async fetchAndSaveCurrentTemperature(farmId: string, zoneId?: string): Promise<TemperatureReading | null> {
    const coordinates = await this.getCoordinates(farmId, zoneId); if (!coordinates) throw new Error('No latitude/longitude is configured for this farm or zone.');
    const { data, error } = await this.supabaseService.client.functions.invoke<FortyGuardResponse>('fortyguard-proxy', { body: { action: 'current-temperature', latitude: coordinates.latitude, longitude: coordinates.longitude } });
    if (error) throw new Error(await this.formatFunctionError(error));
    if (!data?.success || !data.data) throw new Error(data?.message ?? data?.error ?? 'Invalid FortyGuard response.');
    const current = data.data; if (!this.isFiniteNumber(current.temperature)) throw new Error('FortyGuard completed but no valid temperature was returned.');
    const diagnostics: TemperatureDiagnostics = { status: 'Completed', resultReceived: true, heatmapActivityId: current.heatmapActivityId, environmentalActivityId: current.environmentalActivityId, resultKeys: current.resultKeys, statsKeys: current.statsKeys, nCells: current.nCells, featuresCount: current.featuresCount };
    const reading: TemperatureReading = { farmId, zoneId, temperature: this.roundTemperature(Number(current.temperature)), feelsLike: this.toNumber(current.feelsLike), humidity: this.toNumber(current.humidity), heatIndex: this.toNumber(current.heatIndex), wetBulbTemperature: this.toNumber(current.wetBulbTemperature), precipitation: this.toNumber(current.precipitation), cloudCover: this.toNumber(current.cloudCover), aqi: this.toNumber(current.aqi), solarIrradiance: current.solarIrradiance ?? null, recordedAt: current.recordedAt ?? new Date().toISOString(), source: 'api', diagnostics };
    await this.saveTemperatureReading(reading); return reading;
  }

  private async getLatestCachedReading(farmId: string, zoneId?: string): Promise<TemperatureReading | null> {
    let query = this.supabaseService.client.from('temperature_readings').select('*').eq('farm_id', farmId).not('temperature', 'is', null).gt('temperature', 0).order('recorded_at', { ascending: false }).limit(1);
    if (zoneId) query = query.eq('zone_id', zoneId);
    const { data, error } = await query.maybeSingle(); if (error) throw error; if (!data) return null;
    return { id: data.id, farmId: data.farm_id, zoneId: data.zone_id, temperature: this.roundTemperature(Number(data.temperature)), feelsLike: this.toNumber(data.apparent_temperature), humidity: this.toNumber(data.humidity), heatIndex: this.toNumber(data.heat_index), wetBulbTemperature: this.toNumber(data.wet_bulb_temperature), recordedAt: data.recorded_at, source: data.source || 'api' };
  }

  private async formatFunctionError(error: any): Promise<string> {
    let detail = ''; try { const response = error?.context as Response | undefined; if (response) { const body = await response.clone().json().catch(() => null); if (body) detail = ` | ${JSON.stringify(body)}`; } } catch {}
    return `FortyGuard Edge Function error: ${error?.message || 'Unknown error'}${detail}`;
  }

  private async getCoordinates(farmId: string, zoneId?: string): Promise<{ latitude: number; longitude: number } | null> {
    if (zoneId?.trim()) {
      const { data: zone, error } = await this.supabaseService.client.from('farm_zones').select('latitude, longitude').eq('id', zoneId).eq('farm_id', farmId).maybeSingle();
      if (error) throw error; if (this.validCoordinates(zone?.latitude, zone?.longitude)) return { latitude: Number(zone!.latitude), longitude: Number(zone!.longitude) };
    }
    const { data: farm, error } = await this.supabaseService.client.from('farms').select('latitude, longitude').eq('id', farmId).maybeSingle();
    if (error) throw error; if (!this.validCoordinates(farm?.latitude, farm?.longitude)) return null;
    return { latitude: Number(farm!.latitude), longitude: Number(farm!.longitude) };
  }

  private validCoordinates(latitude: unknown, longitude: unknown): boolean { const lat = Number(latitude), lon = Number(longitude); return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180; }
  private isFiniteNumber(value: unknown): value is number { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)); }
  private toNumber(value: unknown): number | undefined { return this.isFiniteNumber(value) ? Number(value) : undefined; }
  private roundTemperature(value: number): number { return Math.round(value * 10) / 10; }
}
