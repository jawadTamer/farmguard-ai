declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BASE_URL = 'https://api.fortyguard.com';
const HEATMAP_MAX_POLLS = 150;
const ENV_MAX_POLLS = 60;
const POLL_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000;

type Coordinates = { latitude: number; longitude: number };
type DateTime = { startDate: string; startTime: string };
type TrendActivity = { activityId: string; timestamp: string; startDate: string; startTime: string };

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

async function getActivityStatus(activityId: string) {
  try {
    const payload = await fg(`/v1/status/${encodeURIComponent(activityId)}`, { method: 'GET' });
    const data = payload?.data ?? payload ?? {};
    return {
      activityId,
      status: String(data?.status ?? '').toLowerCase(),
      result: data?.result ?? null,
      message: data?.message ?? payload?.message ?? null,
    };
  } catch (error) {
    // FortyGuard documents a brief 404 propagation window immediately after submission.
    if (error instanceof FortyGuardHttpError && error.status === 404) {
      return { activityId, status: 'pending', result: null, message: 'Activity not visible yet.' };
    }
    throw error;
  }
}

type ActivityStatusResult = { activityId: string; status: string; result: any; raw: any; attempts: number; };

async function waitForActivity(activityId: string, activityType = 'FortyGuard activity', maxPolls = ENV_MAX_POLLS): Promise<ActivityStatusResult> {
  let lastStatus = 'unknown', lastPayload: any = null, consecutive404s = 0;
  for (let attempt = 1; attempt <= maxPolls; attempt++) {
    try {
      const payload = await fg(`/v1/status/${encodeURIComponent(activityId)}`, { method: 'GET' });
      lastPayload = payload;
      const data = payload?.data ?? payload ?? {};
      const status = String(data?.status ?? payload?.status ?? '').trim().toLowerCase();
      lastStatus = status || 'unknown';
      console.log('[FortyGuard] STATUS', JSON.stringify({ activityType, activityId, attempt, maxAttempts: maxPolls, status: lastStatus }));
      consecutive404s = 0;
      if (['completed','complete','succeeded','success'].includes(lastStatus)) return { activityId, status: lastStatus, result: data?.result ?? payload?.result ?? null, raw: payload, attempts: attempt };
      if (['failed','failure','error','cancelled','canceled'].includes(lastStatus)) throw new Error(data?.message ?? payload?.message ?? `${activityType} failed with status ${lastStatus}.`);
    } catch (error) {
      if (error instanceof FortyGuardHttpError && error.status === 404) {
        consecutive404s++;
        if (consecutive404s > 10) throw new Error(`${activityType} status endpoint kept returning 404 for activity ${activityId}.`);
      } else throw error;
    }
    await new Promise(resolve => setTimeout(resolve, POLL_DELAY_MS));
  }
  const elapsedSeconds = Math.round((maxPolls * POLL_DELAY_MS) / 1000);
  throw new Error(`${activityType} timed out. Activity ID: ${activityId}. Last status: ${lastStatus}. Waited approximately ${elapsedSeconds} seconds. Last response: ${JSON.stringify(lastPayload ?? {}).slice(0,1500)}`);
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

  const features = Array.isArray(result?.map_data?.features) ? result.map_data.features : [];
  const tileValues = features
    .map((feature: any) => numberValue(feature?.properties?.average_temperature ?? feature?.properties?.temperature ?? feature?.properties?.value))
    .filter((n: number | null): n is number => n !== null);
  if (tileValues.length) return tileValues.reduce((a: number, b: number) => a + b, 0) / tileValues.length;

  return null;
}

async function submitHeatmap(coordinates: Coordinates, dateTime: DateTime) {
  const submitted = await fg('/v1/heatmap', {
    method: 'POST',
    body: JSON.stringify({
      polygon_aoi: buildPolygon(coordinates),
      date_time: {
        start_date: dateTime.startDate,
        start_time: dateTime.startTime,
        filter_type: 1,
      },
      granularity: 100,
      analytic_type: 'tcm',
    }),
  });

  const activityId = submitted?.data?.activity_id ?? submitted?.activity_id;
  if (!activityId) throw new Error('FortyGuard heatmap submission returned no activity_id.');
  return activityId;
}

async function heatmap(coordinates: Coordinates, dateTime: DateTime) {
  const activityId = await submitHeatmap(coordinates, dateTime);
  const completed = await waitForActivity(activityId, 'Heatmap', HEATMAP_MAX_POLLS);
  const result = completed.result;
  return { result, activityId, temperature: extractMeanTemperature(result), dateTime, pollingStatus: completed.status, pollingAttempts: completed.attempts };
}

async function env(coordinates: Coordinates, temperature: number, start: DateTime, end?: DateTime, analysis?: string[]) {
  const isRange = !!end;
  const submitted = await fg('/v1/env_params', { method: 'POST', body: JSON.stringify({
    latitude: coordinates.latitude, longitude: coordinates.longitude, temperature,
    date_time: isRange
      ? { start_date: start.startDate, start_time: start.startTime, end_date: end!.startDate, end_time: end!.startTime, filter_type: 2 }
      : { start_date: start.startDate, start_time: start.startTime, filter_type: 1 },
    ...(analysis?.length ? { analysis } : {}),
  })});
  const activityId = submitted?.data?.activity_id ?? submitted?.activity_id;
  if (!activityId) throw new Error('FortyGuard environmental submission returned no activity_id.');
  const completed = await waitForActivity(activityId, isRange ? 'Environmental parameters range' : 'Environmental parameters', ENV_MAX_POLLS);
  const result = completed.result, location = result?.locations?.[0] ?? {}, parameters = location?.parameters ?? {};
  return { activityId, result, resultReceived: !!result, pollingStatus: completed.status, pollingAttempts: completed.attempts,
    temperature: numberValue(location.temperature) ?? temperature,
    heatIndex: parameters.heat_index_celsius ?? null, apparentTemperature: parameters.apparent_temperature_celsius ?? null,
    humidity: parameters.relative_humidity_percent ?? null, precipitation: parameters.precipitation_mm ?? null,
    wetBulbTemperature: parameters.wet_bulb_temperature_celsius ?? null, cloudCover: parameters.cloud_cover_octas ?? null,
    aqi: parameters['air_quality:idx'] ?? parameters.aqi_us ?? null, solarIrradiance: location.solar_irradiance ?? null,
    metadata: result?.metadata ?? null, parameters };
}

function addHours(dateTime: DateTime, hours: number): DateTime {
  const d = new Date(`${dateTime.startDate}T${dateTime.startTime}:00Z`);
  d.setUTCHours(d.getUTCHours() + hours);
  return { startDate: d.toISOString().slice(0,10), startTime: d.toISOString().slice(11,16) };
}

function toTrendPoints(environmental: any) {
  const timestamps = Array.isArray(environmental?.metadata?.timestamps) ? environmental.metadata.timestamps : [];
  const apparent = Array.isArray(environmental?.parameters?.apparent_temperature_celsius) ? environmental.parameters.apparent_temperature_celsius : [];
  const heatIndex = Array.isArray(environmental?.parameters?.heat_index_celsius) ? environmental.parameters.heat_index_celsius : [];
  const wetBulb = Array.isArray(environmental?.parameters?.wet_bulb_temperature_celsius) ? environmental.parameters.wet_bulb_temperature_celsius : [];
  const count = Math.max(timestamps.length, apparent.length, heatIndex.length, wetBulb.length);
  return Array.from({ length: count }, (_, i) => {
    const apparentTemperature = numberValue(apparent[i]);
    const heatIndexTemperature = numberValue(heatIndex[i]);
    const wetBulbTemperature = numberValue(wetBulb[i]);
    return { timestamp: timestamps[i] ?? null, temperature: apparentTemperature ?? heatIndexTemperature ?? null, apparentTemperature, heatIndex: heatIndexTemperature, wetBulbTemperature };
  });
}

async function directTemperatureTrend(coordinates: Coordinates, hours = 12) {
  const count = Math.min(Math.max(Math.floor(hours), 1), 12);
  const end = getPreviousCompletedHour();
  const start = addHours(end, -(count - 1));
  const heat = await heatmap(coordinates, start);
  if (heat.temperature === null) throw new Error('Cannot generate temperature trend because the heatmap completed without a valid temperature.');
  const environmental = await env(coordinates, heat.temperature, start, end, ['apparent_temperature_celsius']);
  const points = toTrendPoints(environmental);
  return { resultReceived: environmental.resultReceived, requestedHours: count, returnedHours: points.filter(p => p.temperature !== null).length,
    completed: environmental.resultReceived ? 1 : 0, processing: 0, failed: 0, done: true, points,
    metadata: environmental.metadata, sourceTemperature: heat.temperature, temperatureSource: 'heatmap',
    heatmapActivityId: heat.activityId, environmentalActivityId: environmental.activityId,
    polling: { heatmap: { status: heat.pollingStatus, attempts: heat.pollingAttempts }, environmental: { status: environmental.pollingStatus, attempts: environmental.pollingAttempts } } };
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const action = body?.action;

    if (action === 'health') {
      return jsonResponse({ success: true, data: { fortyGuardApiKeyConfigured: !!Deno.env.get('FORTYGUARD_API_KEY'), timestamp: new Date().toISOString() } });
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
      if (!Number.isFinite(temperature)) return jsonResponse({ success: false, error: 'temperature is required for environmental-parameters.' }, 400);
      const dateTime = getPreviousCompletedHour();
      return jsonResponse({ success: true, action, data: await env(coordinates, temperature, dateTime) });
    }

    if (action === 'temperature-trend') {
      const requestedHours = Number(body?.hours ?? 12);
      return jsonResponse({ success: true, action, data: await directTemperatureTrend(coordinates, Number.isFinite(requestedHours) ? requestedHours : 12) });
    }

    return jsonResponse({ success: false, error: 'Unknown action. Use current-temperature, environmental-parameters, temperature-trend, or health.' }, 400);
  } catch (error) {
    console.error('[FortyGuard] proxy error', error);
    if (error instanceof FortyGuardHttpError) {
      return jsonResponse({ success: false, error: 'FortyGuard API error', message: error.message, endpoint: error.endpoint, status: error.status, body: error.safeBody }, 502);
    }
    return jsonResponse({ success: false, error: 'Edge Function internal error', message: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});