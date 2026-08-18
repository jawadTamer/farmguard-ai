import { TemperatureProvider } from './temperature-provider.interface';
import { TemperatureReading, TemperatureForecast } from '../models/temperature.model';
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
}

export class FortyGuardTemperatureProvider implements TemperatureProvider {
  readonly providerName = 'FortyGuardTemperatureProvider';

  constructor(private readonly supabaseService: SupabaseService) {}

  async getCurrentTemperature(
    farmId: string,
    zoneId?: string,
  ): Promise<TemperatureReading | null> {
    if (!farmId || farmId.trim() === '') {
      throw new Error('Farm ID is required to get current temperature.');
    }

    const coordinates = await this.getCoordinates(farmId, zoneId);

    if (!coordinates) {
      throw new Error('No latitude/longitude is configured for this farm or zone.');
    }

    console.log('[FortyGuard] Using coordinates:', { latitude: coordinates.latitude, longitude: coordinates.longitude });

    const { data, error } = await this.supabaseService.client.functions.invoke(
      'fortyguard-proxy',
      {
        body: {
          action: 'current-temperature',
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        },
      },
    );

    if (error) {
      console.error('[FortyGuard] Edge Function error:', error);
      const errorMessage = error.message || 'Unknown Edge Function error';
      const errorContext = (error as any).context;
      
      console.error('[FortyGuard] Error context:', {
        status: errorContext?.status,
        statusCode: (error as any).statusCode
      });
      
      // Safely check if errorContext.text is a string before parsing
      if (errorContext?.text && typeof errorContext.text === 'string') {
        try {
          const errorBody = JSON.parse(errorContext.text);
          console.error('[FortyGuard] Parsed error body:', errorBody);
          const fgMessage = errorBody.message || errorBody.error || errorMessage;
          const fgStatus = errorBody.status || errorContext.status || (error as any).statusCode;
          const fgEndpoint = errorBody.endpoint;
          throw new Error(`FortyGuard API error: ${fgMessage}${fgStatus ? ` (HTTP ${fgStatus})` : ''}${fgEndpoint ? ` - ${fgEndpoint}` : ''}`);
        } catch (parseError) {
          console.error('[FortyGuard] Failed to parse error body:', parseError);
          console.error('[FortyGuard] Raw error text:', errorContext.text);
        }
      }
      
      throw new Error(`FortyGuard Edge Function error: ${errorMessage}`);
    }

    if (!data?.success || !data?.data) {
      const errorMessage = data?.message ?? data?.error ?? 'Invalid FortyGuard response.';
      const fortyGuardStatus = data?.status ?? data?.statusCode;
      const fortyGuardEndpoint = data?.endpoint;
      console.error('[FortyGuard] API error response:', { errorMessage, fortyGuardStatus, fortyGuardEndpoint, data });
      throw new Error(`FortyGuard API error: ${errorMessage}${fortyGuardStatus ? ` (HTTP ${fortyGuardStatus})` : ''}${fortyGuardEndpoint ? ` - ${fortyGuardEndpoint}` : ''}`);
    }

    const current = data.data as FortyGuardCurrentResponse;

    if (!Number.isFinite(Number(current.temperature))) {
      throw new Error('FortyGuard returned an invalid temperature.');
    }

    const reading: TemperatureReading = {
      farmId,
      zoneId,
      temperature: Number(current.temperature),
      feelsLike: this.toNumber(current.feelsLike),
      humidity: this.toNumber(current.humidity),
      recordedAt: current.recordedAt ?? new Date().toISOString(),
      source: 'api',
    };

    await this.saveTemperatureReading(reading);

    return reading;
  }

  async getTemperatureHistory(
    farmId: string,
    zoneId?: string,
    days: number = 7,
  ): Promise<TemperatureReading[]> {
    const cutoffDate = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    ).toISOString();

    let query = this.supabaseService.client
      .from('temperature_readings')
      .select('*')
      .eq('farm_id', farmId)
      .gte('recorded_at', cutoffDate)
      .order('recorded_at', { ascending: false });

    if (zoneId) {
      query = query.eq('zone_id', zoneId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data ?? []).map((reading) => ({
      id: reading.id,
      farmId: reading.farm_id,
      zoneId: reading.zone_id,
      temperature: Number(reading.temperature),
      feelsLike: this.toNumber(reading.feels_like),
      humidity: this.toNumber(reading.humidity),
      recordedAt: reading.recorded_at,
      source: reading.source || 'api',
    }));
  }

  async getForecast(
    farmId: string,
    zoneId?: string,
  ): Promise<TemperatureForecast[]> {
    // FortyGuard heatmaps support forecast requests up to 12 hours ahead.
    // Keep forecast integration isolated here; current-temperature and
    // environmental parameters are the first production integration step.
    return [];
  }

  async saveTemperatureReading(reading: TemperatureReading): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('temperature_readings')
      .insert({
        farm_id: reading.farmId,
        zone_id: reading.zoneId,
        temperature: reading.temperature,
        feels_like: reading.feelsLike,
        humidity: reading.humidity,
        source: reading.source,
        recorded_at: reading.recordedAt,
      });

    if (error) {
      throw error;
    }
  }

  async getEnvironmentalParameters(
    farmId: string,
    zoneId?: string,
    temperature?: number,
  ): Promise<Record<string, unknown>> {
    const coordinates = await this.getCoordinates(farmId, zoneId);

    if (!coordinates) {
      throw new Error('No latitude/longitude is configured for this farm or zone.');
    }

    const currentTemperature = temperature ?? (
      await this.getCurrentTemperature(farmId, zoneId)
    )?.temperature;

    if (!Number.isFinite(Number(currentTemperature))) {
      throw new Error('A valid temperature is required for environmental parameters.');
    }

    const { data, error } = await this.supabaseService.client.functions.invoke(
      'fortyguard-proxy',
      {
        body: {
          action: 'environmental-parameters',
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          temperature: Number(currentTemperature),
        },
      },
    );

    if (error) {
      throw new Error(`FortyGuard Edge Function error: ${error.message}`);
    }

    if (!data?.success || !data?.data) {
      throw new Error(data?.message ?? data?.error ?? 'Invalid environmental response.');
    }

    return data.data;
  }

  private async getCoordinates(
    farmId: string,
    zoneId?: string,
  ): Promise<{ latitude: number; longitude: number } | null> {
    if (!farmId || farmId.trim() === '') {
      console.warn('[FortyGuard] Invalid farmId provided');
      return null;
    }

    console.log('[FortyGuard] Fetching coordinates for farmId:', farmId, 'zoneId:', zoneId);

    if (zoneId && zoneId.trim() !== '') {
      const { data: zone, error: zoneError } = await this.supabaseService.client
        .from('farm_zones')
        .select('latitude, longitude')
        .eq('id', zoneId)
        .eq('farm_id', farmId)
        .maybeSingle();

      if (zoneError) {
        console.error('[FortyGuard] Zone query error:', zoneError);
        throw zoneError;
      }

      console.log('[FortyGuard] Zone coordinates:', { latitude: zone?.latitude, longitude: zone?.longitude });

      if (this.validCoordinates(zone?.latitude, zone?.longitude)) {
        const coords = {
          latitude: Number(zone!.latitude),
          longitude: Number(zone!.longitude),
        };
        console.log('[FortyGuard] Using zone coordinates:', coords);
        return coords;
      }
    }

    const { data: farm, error: farmError } = await this.supabaseService.client
      .from('farms')
      .select('latitude, longitude')
      .eq('id', farmId)
      .maybeSingle();

    if (farmError) {
      console.error('[FortyGuard] Farm query error:', farmError);
      throw farmError;
    }

    console.log('[FortyGuard] Farm coordinates:', { latitude: farm?.latitude, longitude: farm?.longitude });

    if (!this.validCoordinates(farm?.latitude, farm?.longitude)) {
      console.warn('[FortyGuard] Invalid farm coordinates');
      return null;
    }

    const coords = {
      latitude: Number(farm!.latitude),
      longitude: Number(farm!.longitude),
    };
    console.log('[FortyGuard] Using farm coordinates:', coords);
    return coords;
  }

  private validCoordinates(latitude: unknown, longitude: unknown): boolean {
    const lat = Number(latitude);
    const lon = Number(longitude);

    return Number.isFinite(lat)
      && Number.isFinite(lon)
      && lat >= -90
      && lat <= 90
      && lon >= -180
      && lon <= 180;
  }

  private toNumber(value: unknown): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
}
