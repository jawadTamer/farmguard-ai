declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FORTYGUARD_BASE_URL = 'https://api.fortyguard.com';
const MAX_POLLS = 60;
const POLL_DELAY_MS = 1500;

type Coordinates = { latitude: number; longitude: number };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function getUtcDateTime() {
  const now = new Date();
  return { startDate: now.toISOString().slice(0, 10), startTime: now.toISOString().slice(11, 16) };
}

function buildPointFeatureCollection({ latitude, longitude }: Coordinates) {
  const delta = 0.0005;
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[
    [longitude - delta, latitude - delta], [longitude + delta, latitude - delta],
    [longitude + delta, latitude + delta], [longitude - delta, latitude + delta],
    [longitude - delta, latitude - delta],
  ]] } }] };
}

async function fortyGuardRequest(path: string, init: RequestInit = {}) {
  const apiKey = Deno.env.get('FORTYGUARD_API_KEY');
  if (!apiKey) throw new Error('FORTYGUARD_API_KEY is not configured in Supabase secrets.');

  const response = await fetch(`${FORTYGUARD_BASE_URL}${path}`, {
    ...init,
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

  const text = await response.text();
  let payload: any;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (!response.ok) {
    const error = new Error(`FortyGuard ${response.status}: ${payload?.message ?? payload?.error ?? text}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function waitForActivity(activityId: string) {
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    try {
      const payload = await fortyGuardRequest(`/v1/status/${activityId}`, { method: 'GET', headers: { 'Content-Type': '' } });
      const status = String(payload?.data?.status ?? '').toLowerCase();
      if (status === 'completed' || status === 'succeeded') return payload?.data?.result ?? null;
      if (status === 'failed' || status === 'error') throw new Error(payload?.data?.message ?? 'FortyGuard activity failed.');
    } catch (error) {
      if ((error as { status?: number })?.status !== 404) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
  }
  throw new Error('FortyGuard activity timed out while waiting for completion.');
}

function firstNumeric(value: unknown): number | null {
  if (Array.isArray(value)) { const number = Number(value[0]); return Number.isFinite(number) ? number : null; }
  const number = Number(value); return Number.isFinite(number) ? number : null;
}

function extractMeanTemperature(result: any): number | null {
  const feature = result?.map_data?.features?.[0];
  const featureTemperature = firstNumeric(feature?.properties?.average_temperature);
  if (featureTemperature !== null) return featureTemperature;
  return firstNumeric(result?.stats_data?.Temperature_stats?.Mean ?? result?.stats_data?.temperature_stats?.mean);
}

async function getCurrentTemperature(coordinates: Coordinates) {
  const dateTime = getUtcDateTime();
  const submitted = await fortyGuardRequest('/v1/heatmap', {
    method: 'POST',
    body: JSON.stringify({ polygon_aoi: buildPointFeatureCollection(coordinates), date_time: { start_date: dateTime.startDate, start_time: dateTime.startTime, filter_type: 1 }, granularity: 100, analytic_type: 'tcm' }),
  });
  const activityId = submitted?.data?.activity_id;
  if (!activityId) throw new Error('FortyGuard did not return an activity_id for the heatmap request.');
  const result = await waitForActivity(activityId);
  const temperature = extractMeanTemperature(result);
  if (temperature === null) throw new Error('Could not extract temperature from FortyGuard heatmap result.');
  return { temperature, recordedAt: new Date().toISOString(), activityId, dateTime };
}

async function getEnvironmentalParameters(coordinates: Coordinates, temperature: number, dateTime: { startDate: string; startTime: string }) {
  const submitted = await fortyGuardRequest('/v1/env_params', {
    method: 'POST',
    body: JSON.stringify({ latitude: coordinates.latitude, longitude: coordinates.longitude, temperature, date_time: { start_date: dateTime.startDate, start_time: dateTime.startTime, filter_type: 1 } }),
  });
  const activityId = submitted?.data?.activity_id;
  if (!activityId) throw new Error('FortyGuard did not return an activity_id for environmental parameters.');
  const result = await waitForActivity(activityId);
  const location = result?.locations?.[0];
  const parameters = location?.parameters ?? {};
  return {
    activityId,
    temperature: firstNumeric(location?.temperature) ?? temperature,
    heatIndex: firstNumeric(parameters.heat_index_celsius),
    apparentTemperature: firstNumeric(parameters.apparent_temperature_celsius),
    humidity: firstNumeric(parameters.relative_humidity_percent),
    precipitation: firstNumeric(parameters.precipitation_mm),
    wetBulbTemperature: firstNumeric(parameters.wet_bulb_temperature_celsius),
    cloudCover: firstNumeric(parameters.cloud_cover_octas),
    aqi: firstNumeric(parameters.aqi_us_co),
    solarIrradiance: location?.solar_irradiance ?? parameters.solar_irradiance ?? null,
    metadata: result?.metadata ?? null,
    raw: result,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  try {
    const body = await req.json();
    const action = body?.action;
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return jsonResponse({ error: 'latitude and longitude are required and must be valid numbers.' }, 400);
    const coordinates = { latitude, longitude };
    if (action === 'current-temperature') {
      const current = await getCurrentTemperature(coordinates);
      let environmental = null;
      try { environmental = await getEnvironmentalParameters(coordinates, current.temperature, current.dateTime); } catch (error) { console.warn('Environmental parameters request failed:', error); }
      return jsonResponse({ success: true, action, data: {
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
      }});
    }
    if (action === 'environmental-parameters') {
      const temperature = Number(body?.temperature);
      if (!Number.isFinite(temperature)) return jsonResponse({ error: 'temperature is required for environmental-parameters.' }, 400);
      return jsonResponse({ success: true, action, data: await getEnvironmentalParameters(coordinates, temperature, getUtcDateTime()) });
    }
    return jsonResponse({ error: 'Unknown action. Use current-temperature or environmental-parameters.' }, 400);
  } catch (error) {
    console.error('FortyGuard proxy error:', error);
    return jsonResponse({ error: 'FortyGuard request failed', message: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
