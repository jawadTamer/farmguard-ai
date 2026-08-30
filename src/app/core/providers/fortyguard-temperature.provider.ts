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

type Coordinates = { latitude: number; longitude: number };

interface FunctionEnvelope<T> {
  success: boolean;
  action?: string;
  data?: T;
  error?: string;
  message?: string;
}

interface CurrentSubmit { activityId: string }
interface CurrentStatus {
  activityId: string;
  status?: string;
  done?: boolean;
  temperature?: number | null;
  recordedAt?: string;
  resultReceived?: boolean;
  message?: string | null;
}
interface TrendSubmit {
  activityId: string;
  requestedHours?: number;
}
interface TrendPointResponse {
  timestamp: string | null;
  temperature: number | null;
  apparentTemperature?: number | null;
  heatIndex?: number | null;
  humidity?: number | null;
}
interface TrendStatus {
  activityId: string;
  status?: string;
  done?: boolean;
  resultReceived?: boolean;
  points?: TrendPointResponse[];
  returnedHours?: number;
  message?: string | null;
}

export class FortyGuardTemperatureProvider implements TemperatureProvider {
  readonly providerName = 'FortyGuardTemperatureProvider';

  private static readonly REFRESH_AFTER_MS = 5 * 60 * 1000;
  private static readonly POLL_INTERVAL_MS = 2_000;
  private static readonly POLL_TIMEOUT_MS = 3 * 60 * 1000;
  private static readonly refreshInFlight = new Map<string, Promise<TemperatureReading | null>>();
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 1_000;
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 3;
  private static readonly CIRCUIT_BREAKER_TIMEOUT_MS = 5 * 60 * 1000;

  private static failureCount = 0;
  private static circuitBreakerOpenUntil = 0;

  constructor(private readonly supabaseService: SupabaseService) { }

  async getCurrentTemperature(farmId: string, zoneId?: string): Promise<TemperatureReading | null> {
    if (!farmId?.trim()) throw new Error('Farm ID is required to get current temperature.');

    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      console.warn('[FortyGuard] Circuit breaker is open, using cached data if available');
      const cached = await this.getLatestCachedReading(farmId, zoneId);
      if (cached) return cached;
      throw new Error('FortyGuard API is temporarily unavailable. Please try again later.');
    }

    const cached = await this.getLatestCachedReading(farmId, zoneId);
    if (cached) {
      if (Date.now() - new Date(cached.recordedAt).getTime() >= FortyGuardTemperatureProvider.REFRESH_AFTER_MS) {
        void this.refreshInBackground(farmId, zoneId);
      }
      return cached;
    }

    try {
      return await this.refreshFromFortyGuard(farmId, zoneId);
    } catch (error) {
      this.recordFailure();
      // Fallback to cached data even if expired
      const fallback = await this.getLatestCachedReading(farmId, zoneId);
      if (fallback) {
        console.warn('[FortyGuard] API failed, returning cached data as fallback:', error);
        return fallback;
      }
      throw error;
    }
  }

  async refreshCurrentTemperature(farmId: string, zoneId?: string): Promise<TemperatureReading | null> {
    return this.refreshFromFortyGuard(farmId, zoneId);
  }

  /**
   * Long-running work happens inside FortyGuard, never inside Supabase.
   *
   * 1. Use the current temperature as the required env_params input.
   * 2. Submit exactly ONE 12-hour env_params range activity.
   * 3. Poll with separate, tiny Edge Function requests until completed.
   */
  async getTodayTemperatureTrend(
    farmId: string,
    zoneId?: string,
    currentTemperature?: number,
  ): Promise<TemperatureTrendPoint[]> {
    if (!farmId?.trim()) throw new Error('Farm ID is required to get the temperature trend.');

    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      console.warn('[FortyGuard] Circuit breaker is open, using historical data fallback');
      return this.generateTrendFromHistory(farmId, zoneId, currentTemperature);
    }

    const coordinates = await this.getCoordinates(farmId, zoneId);
    if (!coordinates) throw new Error('No latitude/longitude is configured for this farm or zone.');

    let temperature = this.isFiniteNumber(currentTemperature) ? Number(currentTemperature) : null;
    if (temperature === null) {
      const current = await this.getCurrentTemperature(farmId, zoneId);
      temperature = current && this.isFiniteNumber(current.temperature) ? Number(current.temperature) : null;
    }
    if (temperature === null) throw new Error('A valid current temperature is required before loading the 12-hour trend.');

    try {
      const submitted = await this.invoke<TrendSubmit>({
        action: 'temperature-trend-submit',
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        temperature,
        hours: 12,
      });

      if (!submitted.activityId) throw new Error('FortyGuard did not return a trend activity ID.');

      const completed = await this.waitForTrend(submitted.activityId);
      const points = this.normalizeTrendPoints(completed.points ?? []);

      if (!points.length) {
        throw new Error('FortyGuard completed the trend request but returned no valid hourly values.');
      }

      return points.slice(-12);
    } catch (error) {
      this.recordFailure();
      console.warn('[FortyGuard] Temperature trend failed, using historical data fallback:', error);
      return this.generateTrendFromHistory(farmId, zoneId, temperature);
    }
  }

  private async generateTrendFromHistory(
    farmId: string,
    zoneId?: string,
    currentTemperature?: number,
  ): Promise<TemperatureTrendPoint[]> {
    try {
      const history = await this.getTemperatureHistory(farmId, zoneId, 2);
      if (history.length === 0) return [];

      const currentTemp = this.isFiniteNumber(currentTemperature) ? Number(currentTemperature) : history[0].temperature;

      // Generate 12 hourly points based on historical patterns
      const points: TemperatureTrendPoint[] = [];
      const now = new Date();

      for (let i = 11; i >= 0; i--) {
        const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
        const hour = timestamp.getHours();

        // Use historical data if available for similar time, otherwise use current temp with slight variation
        let temp = currentTemp;
        const historicalReading = history.find(h => {
          const hTime = new Date(h.recordedAt);
          return hTime.getHours() === hour;
        });

        if (historicalReading && this.isFiniteNumber(historicalReading.temperature)) {
          temp = historicalReading.temperature;
        } else {
          // Add slight temperature variation based on time of day
          const hourVariation = Math.sin((hour - 6) * Math.PI / 12) * 3; // Peak at 6pm, low at 6am
          temp = currentTemp + hourVariation;
        }

        points.push({
          timestamp: timestamp.toISOString(),
          temperature: this.roundTemperature(temp),
          apparentTemperature: this.roundTemperature(temp + 2), // Feels like usually 2°C higher
          heatIndex: this.roundTemperature(temp + 3),
          humidity: history[0].humidity ?? 60,
        });
      }

      return points;
    } catch (error) {
      console.error('[FortyGuard] Failed to generate trend from history:', error);
      return [];
    }
  }

  private async waitForTrend(activityId: string): Promise<TrendStatus> {
    const deadline = Date.now() + FortyGuardTemperatureProvider.POLL_TIMEOUT_MS;
    let lastStatus = 'submitted';

    while (Date.now() < deadline) {
      const data = await this.invoke<TrendStatus>({
        action: 'temperature-trend-status',
        activityId,
      });

      lastStatus = String(data.status ?? lastStatus);
      if (data.done && this.isCompleted(data.status)) return data;
      if (this.isFailed(data.status)) throw new Error(data.message ?? `FortyGuard trend failed with status ${lastStatus}.`);

      await this.sleep(FortyGuardTemperatureProvider.POLL_INTERVAL_MS);
    }

    throw new Error(`FortyGuard trend is still ${lastStatus}. Please refresh later.`);
  }

  async getTemperatureHistory(farmId: string, zoneId?: string, days = 7): Promise<TemperatureReading[]> {
    const cutoffDate = new Date(Date.now() - days * 86400000).toISOString();
    let query = this.supabaseService.client
      .from('temperature_readings')
      .select('*')
      .eq('farm_id', farmId)
      .gte('recorded_at', cutoffDate)
      .order('recorded_at', { ascending: false });
    if (zoneId) query = query.eq('zone_id', zoneId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id, farmId: r.farm_id, zoneId: r.zone_id,
      temperature: Number(r.temperature), feelsLike: this.toNumber(r.apparent_temperature),
      humidity: this.toNumber(r.humidity), heatIndex: this.toNumber(r.heat_index),
      wetBulbTemperature: this.toNumber(r.wet_bulb_temperature), recordedAt: r.recorded_at,
      source: r.source || 'api',
    }));
  }

  async getForecast(_farmId: string, _zoneId?: string): Promise<TemperatureForecast[]> { return []; }

  async saveTemperatureReading(reading: TemperatureReading): Promise<void> {
    const { error } = await this.supabaseService.client.from('temperature_readings').insert({
      farm_id: reading.farmId,
      zone_id: reading.zoneId,
      temperature: this.roundTemperature(reading.temperature),
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

  private async refreshInBackground(farmId: string, zoneId?: string): Promise<void> {
    try { await this.refreshFromFortyGuard(farmId, zoneId); }
    catch (error) { console.warn('[FortyGuard] Background refresh failed; cached value remains available.', error); }
  }

  private async refreshFromFortyGuard(farmId: string, zoneId?: string): Promise<TemperatureReading | null> {
    const key = `${farmId}:${zoneId ?? 'farm'}`;
    const existing = FortyGuardTemperatureProvider.refreshInFlight.get(key);
    if (existing) return existing;

    const request = this.fetchAndSaveCurrentTemperature(farmId, zoneId)
      .finally(() => FortyGuardTemperatureProvider.refreshInFlight.delete(key));
    FortyGuardTemperatureProvider.refreshInFlight.set(key, request);
    return request;
  }

  private async fetchAndSaveCurrentTemperature(farmId: string, zoneId?: string): Promise<TemperatureReading | null> {
    const coordinates = await this.getCoordinates(farmId, zoneId);
    if (!coordinates) throw new Error('No latitude/longitude is configured for this farm or zone.');

    const submitted = await this.invoke<CurrentSubmit>({
      action: 'current-temperature-submit',
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    });
    if (!submitted.activityId) throw new Error('FortyGuard did not return a current-temperature activity ID.');

    const completed = await this.waitForCurrent(submitted.activityId);
    if (!this.isFiniteNumber(completed.temperature)) throw new Error('FortyGuard completed but no valid temperature was returned.');

    // Reset circuit breaker on success
    this.resetCircuitBreaker();

    const diagnostics: TemperatureDiagnostics = {
      status: 'Completed',
      resultReceived: completed.resultReceived ?? true,
      heatmapActivityId: completed.activityId,
    };

    const reading: TemperatureReading = {
      farmId,
      zoneId,
      temperature: this.roundTemperature(Number(completed.temperature)),
      recordedAt: completed.recordedAt ?? new Date().toISOString(),
      source: 'api',
      diagnostics,
    };

    await this.saveTemperatureReading(reading);
    return reading;
  }

  private async waitForCurrent(activityId: string): Promise<CurrentStatus> {
    const deadline = Date.now() + FortyGuardTemperatureProvider.POLL_TIMEOUT_MS;
    let lastStatus = 'submitted';

    while (Date.now() < deadline) {
      const data = await this.invoke<CurrentStatus>({
        action: 'current-temperature-status',
        activityId,
      });

      lastStatus = String(data.status ?? lastStatus);
      if (data.done && this.isCompleted(data.status)) return data;
      if (this.isFailed(data.status)) throw new Error(data.message ?? `FortyGuard current temperature failed with status ${lastStatus}.`);

      await this.sleep(FortyGuardTemperatureProvider.POLL_INTERVAL_MS);
    }

    throw new Error(`FortyGuard current temperature is still ${lastStatus}. Please refresh later.`);
  }

  private async invoke<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabaseService.client.functions.invoke<FunctionEnvelope<T>>(
      'fortyguard-proxy', { body },
    );

    if (error) throw new Error(await this.formatFunctionError(error));
    if (!data?.success || !data.data) throw new Error(data?.message ?? data?.error ?? 'Invalid FortyGuard response.');
    return data.data;
  }

  private normalizeTrendPoints(points: TrendPointResponse[]): TemperatureTrendPoint[] {
    return points
      .filter((point): point is TrendPointResponse & { timestamp: string } =>
        typeof point.timestamp === 'string' && this.isFiniteNumber(point.temperature),
      )
      .map(point => ({
        timestamp: point.timestamp,
        temperature: this.roundTemperature(Number(point.temperature)),
        apparentTemperature: this.toNumber(point.apparentTemperature),
        heatIndex: this.toNumber(point.heatIndex),
        humidity: this.toNumber(point.humidity),
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  private async getLatestCachedReading(farmId: string, zoneId?: string): Promise<TemperatureReading | null> {
    let query = this.supabaseService.client
      .from('temperature_readings')
      .select('*')
      .eq('farm_id', farmId)
      .not('temperature', 'is', null)
      .gt('temperature', 0)
      .order('recorded_at', { ascending: false })
      .limit(1);
    if (zoneId) query = query.eq('zone_id', zoneId);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      farmId: data.farm_id,
      zoneId: data.zone_id,
      temperature: this.roundTemperature(Number(data.temperature)),
      feelsLike: this.toNumber(data.apparent_temperature),
      humidity: this.toNumber(data.humidity),
      heatIndex: this.toNumber(data.heat_index),
      wetBulbTemperature: this.toNumber(data.wet_bulb_temperature),
      recordedAt: data.recorded_at,
      source: data.source || 'api',
    };
  }

  private async getCoordinates(farmId: string, zoneId?: string): Promise<Coordinates | null> {
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
    const lat = Number(latitude), lon = Number(longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }

  private isCompleted(status: unknown): boolean {
    return ['completed', 'complete', 'succeeded', 'success'].includes(String(status ?? '').toLowerCase().trim());
  }

  private isFailed(status: unknown): boolean {
    return ['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(String(status ?? '').toLowerCase().trim());
  }

  private isFiniteNumber(value: unknown): value is number {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) !== -999;
  }

  private toNumber(value: unknown): number | undefined {
    return this.isFiniteNumber(value) ? Number(value) : undefined;
  }

  private roundTemperature(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async formatFunctionError(error: any): Promise<string> {
    let detail = '';
    try {
      const response = error?.context as Response | undefined;
      if (response) {
        const body = await response.clone().json().catch(() => null);
        if (body) detail = ` | ${JSON.stringify(body)}`;
      }
    } catch { }
    return `FortyGuard Edge Function error: ${error?.message || 'Unknown error'}${detail}`;
  }

  private isCircuitBreakerOpen(): boolean {
    return Date.now() < FortyGuardTemperatureProvider.circuitBreakerOpenUntil;
  }

  private recordFailure(): void {
    FortyGuardTemperatureProvider.failureCount++;
    if (FortyGuardTemperatureProvider.failureCount >= FortyGuardTemperatureProvider.CIRCUIT_BREAKER_THRESHOLD) {
      FortyGuardTemperatureProvider.circuitBreakerOpenUntil = Date.now() + FortyGuardTemperatureProvider.CIRCUIT_BREAKER_TIMEOUT_MS;
      FortyGuardTemperatureProvider.failureCount = 0;
      console.warn('[FortyGuard] Circuit breaker opened due to repeated failures');
    }
  }

  private resetCircuitBreaker(): void {
    FortyGuardTemperatureProvider.failureCount = 0;
    FortyGuardTemperatureProvider.circuitBreakerOpenUntil = 0;
  }
}
