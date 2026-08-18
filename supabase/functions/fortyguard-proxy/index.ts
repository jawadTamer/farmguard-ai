declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FORTYGUARD_BASE_URL = 'https://api.fortyguard.com';
const MAX_POLLS = 60;
const POLL_DELAY_MS = 1500;

type Coordinates = { latitude: number; longitude: number };
type DateTime = { startDate: string; startTime: string };

class FortyGuardHttpError extends Error {
  constructor(
    public status: number,
    public endpoint: string,
    message: string,
    public safeBody: string,
  ) {
    super(message);
    this.name = 'FortyGuardHttpError';
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getUtcDateTime(): DateTime {
  const now = new Date();
  return {
    startDate: now.toISOString().slice(0, 10),
    startTime: now.toISOString().slice(11, 16),
  };
}

function buildPointFeatureCollection({ latitude, longitude }: Coordinates) {
  // FortyGuard expects a real polygon AOI. Use a small square around the farm/zone point.
  const delta = 0.005;
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [longitude - delta, latitude - delta],
          [longitude + delta, latitude - delta],
          [longitude + delta, latitude + delta],
          [longitude - delta, latitude + delta],
          [longitude - delta, latitude - delta],
        ]],
      },
    }],
  };
}

async function fortyGuardRequest(path: string, init: RequestInit = {}) {
  const apiKey = Deno.env.get('FORTYGUARD_API_KEY');
  if (!apiKey) throw new Error('FORTYGUARD_API_KEY is not configured in Supabase Edge Function secrets.');

  const response = await fetch(`${FORTYGUARD_BASE_URL}${path}`, {
    ...init,
    headers: {
      'api-key': apiKey,
      ...(path.includes('/status/') ? {} : { 'Content-Type': 'application/json' }),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }

  if (!response.ok || payload?.error === true || payload?.error === 'true') {
    const message = payload?.message ?? payload?.error ?? response.statusText ?? 'FortyGuard request failed';
    const safeBody = text.length > 1000 ? `${text.slice(0, 1000)}...` : text;
    throw new FortyGuardHttpError(response.status, path, String(message), safeBody);
  }

  return payload;
}

async function waitForActivity(activityId: string) {
  let lastStatus = 'unknown';

  for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
    try {
      const payload = await fortyGuardRequest(`/v1/status/${activityId}`, { method: 'GET' });
      const statusData = payload?.data ?? {};
      const status = String(statusData.status ?? '').toLowerCase().trim();
      lastStatus = status || 'unknown';
      console.log(`[FortyGuard] activity=${activityId} poll=${attempt}/${MAX_POLLS} status=${lastStatus}`);

      if (status === 'completed' || status === 'succeeded') return statusData.result ?? null;
      if (status === 'failed' || status === 'error') {
        throw new Error(statusData.message ?? `FortyGuard activity failed with status ${status}.`);
      }
    } catch (error) {
      if ((error as { status?: number })?.status !== 404) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
  }

  throw new Error(`FortyGuard activity timed out after ${MAX_POLLS * POLL_DELAY_MS / 1000}s (last status: ${lastStatus}).`);
}

function firstNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const number = Number(item);
      if (Number.isFinite(number)) return number;
    }
    return null;
  }

  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    for (const key of ['value', 'Value', 'mean', 'Mean', 'temperature', 'Temperature']) {
      const number = firstNumeric(object[key]);
      if (number !== null) return number;
    }
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function meanOfNumericArray(value: unknown): number | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(Number).filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function extractMeanTemperature(result: any): number | null {
  if (!result || typeof result !== 'object') return null;

  const stats = result.stats_data ?? {};
  const temperatureStats = stats.Temperature_stats ?? stats.temperature_stats ?? stats.temperatureStats ?? {};

  // FortyGuard documents Temperature_stats.Mean as the heatmap average.
  for (const candidate of [
    temperatureStats.Mean,
    temperatureStats.mean,
    temperatureStats.Average,
    temperatureStats.average,
    stats.mean_temperature,
    stats.meanTemperature,
    stats.average_temperature,
    stats.averageTemperature,
  ]) {
    const number = firstNumeric(candidate);
    if (number !== null) return number;
  }

  // Fallback: FortyGuard also returns the full temperature distribution.
  const distributionMean = meanOfNumericArray(stats.Overall_temperature_distribution);
  if (distributionMean !== null) return distributionMean;

  // Fallback for tile-level values in map_data.
  const temperatureKeys = [
    'average_temperature', 'avg_temperature', 'mean_temperature',
    'temperature', 'Temperature', 'temp', 'Temp',
    'temperature_celsius', 'temperatureCelsius', 'value', 'Value',
  ];

  const features = Array.isArray(result.map_data?.features) ? result.map_data.features : [];
  const values: number[] = [];
  for (const feature of features) {
    const properties = feature?.properties ?? {};
    for (const key of temperatureKeys) {
      const number = firstNumeric(properties[key]);
      if (number !== null) values.push(number);
    }
  }

  if (values.length) return values.reduce((sum, value) => sum + value, 0) / values.length;
  return null;
}

async function getCurrentTemperature(coordinates: Coordinates) {
  const dateTime = getUtcDateTime();

  const submitted = await fortyGuardRequest('/v1/heatmap', {
    method: 'POST',
    body: JSON.stringify({
      polygon_aoi: buildPointFeatureCollection(coordinates),
      date_time: {
        start_date: dateTime.startDate,
        start_time: dateTime.startTime,
        filter_type: 1,
      },
      granularity: 100,
      analytic_type: 'tcm',
    }),
  });

  const activityId = submitted?.data?.activity_id;
  if (!activityId) throw new Error('FortyGuard heatmap submission returned no activity_id.');

  const result = await waitForActivity(activityId);
  const temperature = extractMeanTemperature(result);

  console.log('[FortyGuard] heatmap result summary', {
    activityId,
    resultKeys: Object.keys(result ?? {}),
    statsKeys: Object.keys(result?.stats_data ?? {}),
    temperature,
  });

  if (temperature === null) {
    throw new Error(
      `FortyGuard completed the heatmap but no temperature value could be extracted. ` +
      `Result keys: ${Object.keys(result ?? {}).join(', ')}, ` +
      `stats keys: ${Object.keys(result?.stats_data ?? {}).join(', ')}`,
    );
  }

  return { temperature, recordedAt: new Date().toISOString(), activityId, dateTime };
}

async function getEnvironmentalParameters(
  coordinates: Coordinates,
  temperature: number,
  dateTime: DateTime,
) {
  const submitted = await fortyGuardRequest('/v1/env_params', {
    method: 'POST',
    body: JSON.stringify({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      temperature,
      date_time: {
        start_date: dateTime.startDate,
        start_time: dateTime.startTime,
        filter_type: 1,
      },
    }),
  });

  const activityId = submitted?.data?.activity_id;
  if (!activityId) throw new Error('FortyGuard environmental submission returned no activity_id.');

  const result = await waitForActivity(activityId);
  const location = result?.locations?.[0] ?? {};
  const parameters = location?.parameters ?? {};

  return {
    activityId,
    temperature: firstNumeric(location.temperature) ?? temperature,
    heatIndex: firstNumeric(parameters.heat_index_celsius),
    apparentTemperature: firstNumeric(parameters.apparent_temperature_celsius),
    humidity: firstNumeric(parameters.relative_humidity_percent),
    precipitation: firstNumeric(parameters.precipitation_mm),
    wetBulbTemperature: firstNumeric(parameters.wet_bulb_temperature_celsius),
    cloudCover: firstNumeric(parameters.cloud_cover_metric),
    aqi: firstNumeric(parameters.aqi_us),
    solarIrradiance: location.solar_irradiance ?? null,
    metadata: result?.metadata ?? null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const action = body?.action;
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return jsonResponse({ success: false, error: 'latitude and longitude are required and must be valid numbers.' }, 400);
    }

    const coordinates = { latitude, longitude };

    if (action === 'current-temperature') {
      const current = await getCurrentTemperature(coordinates);
      let environmental = null;

      try {
        environmental = await getEnvironmentalParameters(coordinates, current.temperature, current.dateTime);
      } catch (error) {
        console.warn('[FortyGuard] environmental parameters failed; returning temperature only:', error);
      }

      return jsonResponse({
        success: true,
        action,
        data: {
          temperature: current.temperature,
          feelsLike: environmental?.apparentTemperature ?? null,
          humidity: environmental?.humidity ?? null,
          heatIndex: environmental?.heatIndex ?? null,
          wetBulbTemperature: environmental?.wetBulbTemperature ?? null,
          precipitation: environmental?.precipitation ?? null,
          cloudCover: environmental?.cloudCover ?? null,
          aqi: environmental?.aqi ?? null,
          solarIrradiance: environmental?.solarIrradiance ?? null,
          recordedAt: current.recordedAt,
          coordinates,
          heatmapActivityId: current.activityId,
          environmentalActivityId: environmental?.activityId ?? null,
        },
      });
    }

    if (action === 'environmental-parameters') {
      const temperature = Number(body?.temperature);
      if (!Number.isFinite(temperature)) {
        return jsonResponse({ success: false, error: 'temperature is required for environmental-parameters.' }, 400);
      }

      return jsonResponse({
        success: true,
        action,
        data: await getEnvironmentalParameters(coordinates, temperature, getUtcDateTime()),
      });
    }

    return jsonResponse({ success: false, error: 'Unknown action. Use current-temperature or environmental-parameters.' }, 400);
  } catch (error) {
    console.error('[FortyGuard] proxy error:', error);

    if (error instanceof FortyGuardHttpError) {
      return jsonResponse({
        success: false,
        error: 'FortyGuard API error',
        message: error.message,
        endpoint: error.endpoint,
        status: error.status,
        body: error.safeBody,
      });
    }

    return jsonResponse({
      success: false,
      error: 'Edge Function internal error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
