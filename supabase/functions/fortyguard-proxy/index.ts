declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BASE_URL = 'https://api.fortyguard.com';
const MAX_POLLS = 30;
const POLL_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 25000;

type Coordinates = { latitude: number; longitude: number };
type DateTime = { startDate: string; startTime: string };

class FortyGuardHttpError extends Error {
  constructor(public status: number, public endpoint: string, message: string, public safeBody: string) {
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

function getPreviousCompletedHour(): DateTime {
  const date = new Date();
  date.setUTCMinutes(0, 0, 0);
  date.setUTCHours(date.getUTCHours() - 1);
  return { startDate: date.toISOString().slice(0, 10), startTime: date.toISOString().slice(11, 16) };
}

function getLastHours(hours = 12): DateTime[] {
  const count = Math.min(Math.max(Math.floor(hours), 1), 12);
  const end = new Date();
  end.setUTCMinutes(0, 0, 0);
  end.setUTCHours(end.getUTCHours() - 1);

  return Array.from({ length: count }, (_, i) => {
    const d = new Date(end.getTime() - (count - 1 - i) * 3600000);
    return { startDate: d.toISOString().slice(0, 10), startTime: d.toISOString().slice(11, 16) };
  });
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

async function fg(path: string, init: RequestInit = {}) {
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
        Accept: 'application/json',
        ...(init.method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }

    if (!response.ok || payload?.error === true || payload?.error === 'true') {
      throw new FortyGuardHttpError(
        response.status,
        path,
        String(payload?.message ?? payload?.error ?? response.statusText ?? 'FortyGuard request failed'),
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
    const payload = await fg(`/v1/status/${activityId}`, { method: 'GET' });
    const data = payload?.data ?? payload ?? {};
    const status = String(data?.status ?? payload?.status ?? '').toLowerCase().trim();
    lastStatus = status || 'unknown';

    if (['completed', 'succeeded', 'success'].includes(status)) {
      return data?.result ?? payload?.result ?? null;
    }

    if (['failed', 'error'].includes(status)) {
      throw new Error(data?.message ?? payload?.message ?? `FortyGuard activity failed with status ${status}.`);
    }

    await new Promise(resolve => setTimeout(resolve, POLL_DELAY_MS));
  }

  throw new Error(`FortyGuard activity timed out. Last status: ${lastStatus}.`);
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return numberValue(value[0]);
  const n = Number(value);
  if (n === -999 || !Number.isFinite(n)) return null;
  return n;
}

function round1(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(1));
}

function extractMeanTemperature(result: any): number | null {
  const stats = result?.stats_data ?? result?.statsData ?? {};
  const temperatureStats = stats?.Temperature_stats ?? stats?.temperature_stats ?? stats?.temperatureStats ?? {};

  for (const candidate of [
    temperatureStats?.Mean,
    temperatureStats?.mean,
    temperatureStats?.Average,
    temperatureStats?.average,
    stats?.mean_temperature,
    stats?.average_temperature,
  ]) {
    const n = numberValue(candidate);
    if (n !== null) return n;
  }

  const distribution = stats?.Overall_temperature_distribution ?? stats?.overall_temperature_distribution;
  if (Array.isArray(distribution) && distribution.length) {
    const values = distribution.map(numberValue).filter((n): n is number => n !== null);
    if (values.length) return values.reduce((a, b) => a + b, 0) / values.length;
  }

  return null;
}

async function heatmap(coordinates: Coordinates, dateTime: DateTime, endTime?: string) {
  const submitted = await fg('/v1/heatmap', {
    method: 'POST',
    body: JSON.stringify({
      polygon_aoi: buildPolygon(coordinates),
      date_time: {
        start_date: dateTime.startDate,
        start_time: dateTime.startTime,
        ...(endTime ? { end_time: endTime } : {}),
        filter_type: endTime ? 2 : 1,
      },
      granularity: 100,
      analytic_type: 'tcm',
    }),
  });

  const activityId = submitted?.data?.activity_id ?? submitted?.activity_id;
  if (!activityId) throw new Error('FortyGuard heatmap submission returned no activity_id.');

  const result = await waitForActivity(activityId);
  return { result, activityId, temperature: extractMeanTemperature(result), dateTime };
}

async function env(coordinates: Coordinates, temperature: number, start: DateTime, endTime?: string) {
  const submitted = await fg('/v1/env_params', {
    method: 'POST',
    body: JSON.stringify({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      temperature,
      date_time: {
        start_date: start.startDate,
        start_time: start.startTime,
        ...(endTime ? { end_time: endTime } : {}),
        filter_type: endTime ? 2 : 1,
      },
    }),
  });

  const activityId = submitted?.data?.activity_id ?? submitted?.activity_id;
  if (!activityId) throw new Error('FortyGuard environmental submission returned no activity_id.');

  const result = await waitForActivity(activityId);
  const location = result?.locations?.[0] ?? {};
  const parameters = location?.parameters ?? {};

  return {
    activityId,
    result,
    resultReceived: !!result,
    temperature: location.temperature ?? temperature,
    heatIndex: parameters.heat_index_celsius ?? null,
    apparentTemperature: parameters.apparent_temperature_celsius ?? null,
    humidity: parameters.relative_humidity_percent ?? null,
    precipitation: parameters.precipitation_mm ?? null,
    wetBulbTemperature: parameters.wet_bulb_temperature_celsius ?? null,
    cloudCover: parameters.cloud_cover_octas ?? null,
    aqi: parameters['air_quality:idx'] ?? null,
    solarIrradiance: location.solar_irradiance ?? null,
    metadata: result?.metadata ?? null,
  };
}

function extractTrendFromEnvironment(result: any, fallback: DateTime[]): Array<{ timestamp: string; temperature: number }> {
  const location = result?.locations?.[0] ?? {};
  const timestamps: string[] = Array.isArray(result?.metadata?.timestamps) ? result.metadata.timestamps : [];
  const rawTemperature = location?.temperature;

  if (Array.isArray(rawTemperature)) {
    return rawTemperature
      .map((value, index) => {
        const n = numberValue(value);
        if (n === null) return null;
        const timestamp = timestamps[index] ?? `${fallback[index]?.startDate}T${fallback[index]?.startTime}:00Z`;
        return { timestamp, temperature: round1(n)! };
      })
      .filter((x): x is { timestamp: string; temperature: number } => x !== null);
  }

  const single = numberValue(rawTemperature);
  if (single !== null && fallback.length === 1) {
    return [{ timestamp: `${fallback[0].startDate}T${fallback[0].startTime}:00Z`, temperature: round1(single)! }];
  }

  return [];
}

async function currentTemperature(coordinates: Coordinates) {
  const dateTime = getPreviousCompletedHour();
  const heat = await heatmap(coordinates, dateTime);

  const temperature = heat.temperature;
  if (temperature === null) throw new Error('FortyGuard heatmap completed but no temperature mean was returned.');

  let environmental: Awaited<ReturnType<typeof env>> | null = null;
  let environmentalError: string | null = null;

  try {
    environmental = await env(coordinates, temperature, dateTime);
  } catch (error) {
    environmentalError = error instanceof Error ? error.message : 'Environmental parameters failed.';
  }

  const locationTemperature = numberValue(environmental?.temperature) ?? temperature;

  return {
    resultReceived: !!heat.result,
    temperature: round1(locationTemperature),
    feelsLike: round1(numberValue(environmental?.apparentTemperature)),
    humidity: round1(numberValue(environmental?.humidity)),
    heatIndex: round1(numberValue(environmental?.heatIndex)),
    wetBulbTemperature: round1(numberValue(environmental?.wetBulbTemperature)),
    precipitation: round1(numberValue(environmental?.precipitation)),
    cloudCover: round1(numberValue(environmental?.cloudCover)),
    aqi: round1(numberValue(environmental?.aqi)),
    solarIrradiance: environmental?.solarIrradiance ?? null,
    recordedAt: new Date().toISOString(),
    coordinates,
    heatmapActivityId: heat.activityId,
    environmentalActivityId: environmental?.activityId ?? null,
    environmentalResultReceived: environmental?.resultReceived ?? false,
    environmentalError,
  };
}

async function temperatureTrend(coordinates: Coordinates, hours = 12) {
  const targets = getLastHours(hours);
  const start = targets[0];
  const end = targets[targets.length - 1];

  // ONE heatmap activity for the complete 12-hour range instead of 12 activities.
  // This is the critical fix for WORKER_RESOURCE_LIMIT / 546.
  const heat = await heatmap(coordinates, start, end.startTime);

  // Use the heatmap mean as the required context temperature for env_params.
  // env_params supports filter_type=2 and returns time-aligned timestamps/arrays.
  if (heat.temperature === null) {
    throw new Error('FortyGuard range heatmap completed but no temperature mean was returned.');
  }

  const environmental = await env(coordinates, heat.temperature, start, end.startTime);
  const points = extractTrendFromEnvironment(environmental.result, targets);

  return {
    resultReceived: points.length > 0,
    requestedHours: targets.length,
    returnedHours: points.length,
    points,
    source: 'FortyGuard env_params range',
    activityId: environmental.activityId,
    metadata: environmental.metadata,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const action = body?.action;

    if (action === 'health') {
      return jsonResponse({
        success: true,
        data: {
          fortyGuardApiKeyConfigured: !!Deno.env.get('FORTYGUARD_API_KEY'),
          timestamp: new Date().toISOString(),
        },
      });
    }

    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return jsonResponse({ success: false, error: 'Valid latitude and longitude are required.' }, 400);
    }

    const coordinates = { latitude, longitude };

    if (action === 'current-temperature') {
      return jsonResponse({ success: true, action, data: await currentTemperature(coordinates) });
    }

    if (action === 'environmental-parameters') {
      const temperature = Number(body?.temperature);
      if (!Number.isFinite(temperature)) {
        return jsonResponse({ success: false, error: 'temperature is required for environmental-parameters.' }, 400);
      }
      const dateTime = getPreviousCompletedHour();
      return jsonResponse({ success: true, action, data: await env(coordinates, temperature, dateTime) });
    }

    if (action === 'temperature-trend') {
      const requestedHours = Number(body?.hours ?? 12);
      const trend = await temperatureTrend(coordinates, Number.isFinite(requestedHours) ? requestedHours : 12);
      return jsonResponse({ success: true, action, data: trend });
    }

    return jsonResponse({
      success: false,
      error: 'Unknown action. Use current-temperature, environmental-parameters, temperature-trend, or health.',
    }, 400);
  } catch (error) {
    console.error('[FortyGuard] proxy error', error);

    if (error instanceof FortyGuardHttpError) {
      return jsonResponse({
        success: false,
        error: 'FortyGuard API error',
        message: error.message,
        endpoint: error.endpoint,
        status: error.status,
        body: error.safeBody,
      }, 502);
    }

    return jsonResponse({
      success: false,
      error: 'Edge Function internal error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});