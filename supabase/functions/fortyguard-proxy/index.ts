declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BASE_URL = 'https://api.fortyguard.com';
const MAX_POLLS = 45;
const POLL_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 30000;

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
  // Use the previous hour so we do not request a partially available current interval.
  const date = new Date(Date.now() - 60 * 60 * 1000);
  return {
    startDate: date.toISOString().slice(0, 10),
    startTime: date.toISOString().slice(11, 16),
  };
}

function buildPolygon({ latitude, longitude }: Coordinates) {
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'api-key': apiKey,
        'Accept': 'application/json',
        ...(init.method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; }
    catch { payload = { raw: text }; }

    if (!response.ok || payload?.error === true || payload?.error === 'true') {
      const message = payload?.message ?? payload?.error ?? response.statusText ?? 'FortyGuard request failed';
      throw new FortyGuardHttpError(
        response.status,
        path,
        String(message),
        text.length > 2000 ? `${text.slice(0, 2000)}...` : text,
      );
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForActivity(activityId: string) {
  let lastStatus = 'unknown';

  for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
    try {
      const payload = await fortyGuardRequest(`/v1/status/${activityId}`, { method: 'GET' });
      const data = payload?.data ?? {};
      const status = String(data.status ?? '').toLowerCase().trim();
      lastStatus = status || 'unknown';

      console.log('[FortyGuard] STATUS', JSON.stringify({ activityId, attempt, status: lastStatus }));

      if (status === 'completed' || status === 'succeeded') {
        return { status: 'Completed' as const, result: data.result ?? null };
      }
      if (status === 'failed' || status === 'error') {
        throw new Error(data.message ?? `FortyGuard activity failed with status ${status}.`);
      }
    } catch (error) {
      if (!(error instanceof FortyGuardHttpError) || error.status !== 404) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
  }

  throw new Error(`FortyGuard activity ${activityId} timed out after ${(MAX_POLLS * POLL_DELAY_MS) / 1000}s. Last status: ${lastStatus}.`);
}

function firstNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const number = firstNumeric(item);
      if (number !== null) return number;
    }
    return null;
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    for (const key of ['value', 'Value', 'mean', 'Mean', 'average', 'Average', 'temperature', 'Temperature']) {
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
  const values = value
    .filter((item) => item !== null && item !== undefined && Number.isFinite(Number(item)))
    .map(Number);
  if (!values.length) return null;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function extractHeatmapTemperature(result: any): number | null {
  if (!result || typeof result !== 'object') return null;
  const stats = result.stats_data ?? {};
  const candidates = [
    stats?.Temperature_stats?.Mean,
    stats?.Temperature_stats?.mean,
    stats?.temperature_stats?.Mean,
    stats?.temperature_stats?.mean,
    stats?.temperatureStats?.Mean,
    stats?.temperatureStats?.mean,
    stats?.mean_temperature,
    stats?.meanTemperature,
    stats?.average_temperature,
    stats?.averageTemperature,
  ];

  for (const candidate of candidates) {
    const value = firstNumeric(candidate);
    if (value !== null) return value;
  }

  const distribution =
    stats?.Overall_temperature_distribution ??
    stats?.overall_temperature_distribution ??
    stats?.temperature_distribution;
  const distributionMean = meanOfNumericArray(distribution);
  if (distributionMean !== null) return distributionMean;

  const values: number[] = [];
  const scan = (value: unknown, key = ''): void => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) scan(item, key);
      return;
    }
    if (typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) scan(childValue, childKey);
      return;
    }
    const normalized = key.toLowerCase();
    const number = Number(value);
    if (Number.isFinite(number) && (
      normalized === 'temperature' ||
      normalized.includes('temperature') ||
      normalized === 'temp'
    )) values.push(number);
  };

  scan(result.map_data);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

async function runHeatmap(coordinates: Coordinates) {
  const dateTime = getUtcDateTime();
  const submitted = await fortyGuardRequest('/v1/heatmap', {
    method: 'POST',
    body: JSON.stringify({
      polygon_aoi: buildPolygon(coordinates),
      date_time: { start_date: dateTime.startDate, start_time: dateTime.startTime, filter_type: 1 },
      granularity: 100,
    }),
  });

  const activityId = submitted?.data?.activity_id;
  if (!activityId) throw new Error(`FortyGuard heatmap submission returned no activity_id. Response: ${JSON.stringify(submitted)}`);

  const completed = await waitForActivity(activityId);
  const result = completed.result;
  const stats = result?.stats_data ?? {};
  const features = Array.isArray(result?.map_data?.features) ? result.map_data.features : [];
  const temperature = extractHeatmapTemperature(result);
  const diagnostics = {
    activityId,
    status: completed.status,
    resultReceived: !!result,
    temperatureExtracted: temperature !== null,
    resultKeys: Object.keys(result ?? {}),
    statsKeys: Object.keys(stats),
    nCells: Number(stats.n_cells ?? 0),
    featuresCount: features.length,
  };

  console.log('[FortyGuard] HEATMAP COMPLETE', JSON.stringify({ ...diagnostics, temperature }));
  return { temperature, activityId, dateTime, recordedAt: new Date().toISOString(), diagnostics };
}

async function runEnvironmental(coordinates: Coordinates, temperature: number, dateTime: DateTime) {
  const submitted = await fortyGuardRequest('/v1/env_params', {
    method: 'POST',
    body: JSON.stringify({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      temperature,
      date_time: { start_date: dateTime.startDate, start_time: dateTime.startTime, filter_type: 1 },
    }),
  });
  const activityId = submitted?.data?.activity_id;
  if (!activityId) throw new Error('FortyGuard environmental submission returned no activity_id.');

  const completed = await waitForActivity(activityId);
  const result = completed.result;
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
    cloudCover: firstNumeric(parameters.cloud_cover_octas),
    aqi: firstNumeric(parameters['air_quality:idx']),
    solarIrradiance: location.solar_irradiance ?? null,
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
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return jsonResponse({ success: false, error: 'Valid latitude and longitude are required.' }, 400);
    }
    const coordinates = { latitude, longitude };

    if (action === 'health') {
      return jsonResponse({ success: true, data: { fortyGuardApiKeyConfigured: !!Deno.env.get('FORTYGUARD_API_KEY'), timestamp: new Date().toISOString() } });
    }

    if (action === 'current-temperature') {
      const heatmap = await runHeatmap(coordinates);
      let environmental: any = null;
      let environmentalError: string | null = null;

      if (heatmap.temperature !== null) {
        try { environmental = await runEnvironmental(coordinates, heatmap.temperature, heatmap.dateTime); }
        catch (error) {
          environmentalError = error instanceof Error ? error.message : 'Environmental parameters failed.';
          console.warn('[FortyGuard] ENV FAILED', environmentalError);
        }
      }

      // Important: completed heatmap is returned as HTTP 200 even if extraction fails.
      return jsonResponse({
        success: true,
        action,
        data: {
          temperature: heatmap.temperature,
          feelsLike: environmental?.apparentTemperature ?? null,
          humidity: environmental?.humidity ?? null,
          heatIndex: environmental?.heatIndex ?? null,
          wetBulbTemperature: environmental?.wetBulbTemperature ?? null,
          precipitation: environmental?.precipitation ?? null,
          cloudCover: environmental?.cloudCover ?? null,
          aqi: environmental?.aqi ?? null,
          solarIrradiance: environmental?.solarIrradiance ?? null,
          recordedAt: heatmap.recordedAt,
          coordinates,
          heatmapActivityId: heatmap.activityId,
          environmentalActivityId: environmental?.activityId ?? null,
          resultKeys: heatmap.diagnostics.resultKeys,
          statsKeys: heatmap.diagnostics.statsKeys,
          nCells: heatmap.diagnostics.nCells,
          featuresCount: heatmap.diagnostics.featuresCount,
          environmentalError,
          pipeline: {
            heatmapSubmitted: true,
            heatmapCompleted: true,
            temperatureExtracted: heatmap.temperature !== null,
            environmentalSubmitted: heatmap.temperature !== null,
            environmentalCompleted: !!environmental,
          },
        },
      });
    }

    if (action === 'environmental-parameters') {
      const temperature = Number(body?.temperature);
      if (!Number.isFinite(temperature)) return jsonResponse({ success: false, error: 'temperature is required for environmental-parameters.' }, 400);
      return jsonResponse({ success: true, action, data: await runEnvironmental(coordinates, temperature, getUtcDateTime()) });
    }

    return jsonResponse({ success: false, error: 'Unknown action.' }, 400);
  } catch (error) {
    console.error('[FortyGuard] proxy error', error);
    if (error instanceof FortyGuardHttpError) {
      return jsonResponse({ success: false, error: 'FortyGuard API error', message: error.message, endpoint: error.endpoint, status: error.status, body: error.safeBody }, 502);
    }
    return jsonResponse({ success: false, error: 'Edge Function internal error', message: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
