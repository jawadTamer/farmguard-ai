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
  constructor(public status: number, public endpoint: string, message: string, public safeBody: string) {
    super(message);
    this.name = 'FortyGuardHttpError';
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function getUtcDateTime(): DateTime {
  // FortyGuard heatmap/environmental data is hourly. Always request HH:00,
  // never the current minute such as 11:18, which can produce a completed
  // activity with zero heatmap cells.
  const date = new Date(Date.now() - 60 * 60 * 1000);
  date.setUTCMinutes(0, 0, 0);
  return { startDate: date.toISOString().slice(0, 10), startTime: date.toISOString().slice(11, 16) };
}

function getUtcDate(): string { return getUtcDateTime().startDate; }

function buildPolygon({ latitude, longitude }: Coordinates) {
  const delta = 0.005;
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[longitude-delta, latitude-delta], [longitude+delta, latitude-delta], [longitude+delta, latitude+delta], [longitude-delta, latitude+delta], [longitude-delta, latitude-delta]]] } }] };
}

async function fortyGuardRequest(path: string, init: RequestInit = {}) {
  const apiKey = Deno.env.get('FORTYGUARD_API_KEY');
  if (!apiKey) throw new Error('FORTYGUARD_API_KEY is not configured in Supabase Edge Function secrets.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal, headers: { 'api-key': apiKey, Accept: 'application/json', ...(init.method === 'GET' ? {} : { 'Content-Type': 'application/json' }), ...(init.headers ?? {}) } });
    const text = await response.text();
    let payload: any;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
    if (!response.ok || payload?.error === true || payload?.error === 'true') throw new FortyGuardHttpError(response.status, path, String(payload?.message ?? payload?.error ?? response.statusText ?? 'FortyGuard request failed'), text.slice(0, 2000));
    return payload;
  } finally { clearTimeout(timeout); }
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
      if (status === 'completed' || status === 'succeeded' || status === 'success') return { status: 'Completed' as const, result: data.result ?? null };
      if (status === 'failed' || status === 'error') throw new Error(data.message ?? `FortyGuard activity failed with status ${status}.`);
    } catch (error) { if (!(error instanceof FortyGuardHttpError) || error.status !== 404) throw error; }
    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
  }
  throw new Error(`FortyGuard activity ${activityId} timed out after ${(MAX_POLLS * POLL_DELAY_MS) / 1000}s. Last status: ${lastStatus}.`);
}

function firstNumeric(value: unknown): number | null {
  if (value === null || value === undefined || Number(value) === -999) return null;
  if (Array.isArray(value)) { for (const item of value) { const number = firstNumeric(item); if (number !== null) return number; } return null; }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numericArray(value: unknown): (number | null)[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => firstNumeric(item));
}

function mean(values: number[]): number | null { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }

function extractHeatmapTemperature(result: any): number | null {
  const stats = result?.stats_data ?? {};
  const candidates = [stats?.Temperature_stats?.Mean, stats?.Temperature_stats?.mean, stats?.temperature_stats?.Mean, stats?.temperature_stats?.mean, stats?.mean_temperature, stats?.meanTemperature, stats?.average_temperature, stats?.averageTemperature];
  for (const candidate of candidates) { const value = firstNumeric(candidate); if (value !== null) return value; }
  const distribution = stats?.Overall_temperature_distribution ?? stats?.overall_temperature_distribution ?? stats?.temperature_distribution;
  const values = numericArray(distribution).filter((value): value is number => value !== null);
  if (values.length) return mean(values);
  const features = Array.isArray(result?.map_data?.features) ? result.map_data.features : [];
  const featureValues = features.map((feature: any) => firstNumeric(feature?.properties?.temperature ?? feature?.properties?.Temperature ?? feature?.properties?.temp ?? feature?.properties?.value)).filter((value: number | null): value is number => value !== null);
  return mean(featureValues);
}

async function runHeatmap(coordinates: Coordinates) {
  const dateTime = getUtcDateTime();
  console.log('[FortyGuard] HEATMAP REQUEST', JSON.stringify({ coordinates, dateTime }));
  const submitted = await fortyGuardRequest('/v1/heatmap', { method: 'POST', body: JSON.stringify({ polygon_aoi: buildPolygon(coordinates), date_time: { start_date: dateTime.startDate, start_time: dateTime.startTime, filter_type: 1 }, granularity: 100, analytic_type: 'tcm' }) });
  const activityId = submitted?.data?.activity_id;
  if (!activityId) throw new Error('FortyGuard heatmap submission returned no activity_id.');
  const completed = await waitForActivity(activityId);
  const result = completed.result;
  const stats = result?.stats_data ?? {};
  const features = Array.isArray(result?.map_data?.features) ? result.map_data.features : [];
  const temperature = extractHeatmapTemperature(result);
  const diagnostics = { resultKeys: Object.keys(result ?? {}), statsKeys: Object.keys(stats), nCells: Number(stats.n_cells ?? 0), featuresCount: features.length };
  console.log('[FortyGuard] HEATMAP COMPLETE', JSON.stringify({ activityId, dateTime, temperature, ...diagnostics }));
  return { temperature, activityId, dateTime, recordedAt: new Date().toISOString(), diagnostics };
}

async function runEnvironmental(coordinates: Coordinates, temperature: number, dateTime: DateTime) {
  const submitted = await fortyGuardRequest('/v1/env_params', { method: 'POST', body: JSON.stringify({ latitude: coordinates.latitude, longitude: coordinates.longitude, temperature, date_time: { start_date: dateTime.startDate, start_time: dateTime.startTime, filter_type: 1 } }) });
  const activityId = submitted?.data?.activity_id;
  if (!activityId) throw new Error('FortyGuard environmental submission returned no activity_id.');
  const completed = await waitForActivity(activityId);
  const result = completed.result;
  const location = result?.locations?.[0] ?? {};
  const parameters = location.parameters ?? {};
  return { activityId, temperature: firstNumeric(location.temperature) ?? temperature, heatIndex: firstNumeric(parameters.heat_index_celsius), apparentTemperature: firstNumeric(parameters.apparent_temperature_celsius), humidity: firstNumeric(parameters.relative_humidity_percent), precipitation: firstNumeric(parameters.precipitation_mm), wetBulbTemperature: firstNumeric(parameters.wet_bulb_temperature_celsius), cloudCover: firstNumeric(parameters.cloud_cover_octas), aqi: firstNumeric(parameters['air_quality:idx']), solarIrradiance: location.solar_irradiance ?? null, metadata: result?.metadata ?? null };
}

async function runEnvironmentalTrend(coordinates: Coordinates, temperature: number, date: string) {
  const submitted = await fortyGuardRequest('/v1/env_params', { method: 'POST', body: JSON.stringify({ latitude: coordinates.latitude, longitude: coordinates.longitude, temperature, date_time: { start_date: date, filter_type: 3 }, analysis: ['apparent_temperature_celsius', 'heat_index_celsius', 'relative_humidity_percent'] }) });
  const activityId = submitted?.data?.activity_id;
  if (!activityId) throw new Error('FortyGuard environmental trend submission returned no activity_id.');
  const completed = await waitForActivity(activityId);
  const result = completed.result;
  const location = result?.locations?.[0] ?? {};
  const parameters = location.parameters ?? {};
  const timestamps = Array.isArray(result?.metadata?.timestamps) ? result.metadata.timestamps : [];
  const apparent = numericArray(parameters.apparent_temperature_celsius);
  const heatIndex = numericArray(parameters.heat_index_celsius);
  const humidity = numericArray(parameters.relative_humidity_percent);
  const length = Math.max(timestamps.length, apparent.length, heatIndex.length, humidity.length);
  const points = Array.from({ length }, (_, index) => ({ timestamp: timestamps[index] ?? null, temperature: apparent[index] ?? heatIndex[index] ?? null, apparentTemperature: apparent[index] ?? null, heatIndex: heatIndex[index] ?? null, humidity: humidity[index] ?? null })).filter((point) => point.timestamp && point.temperature !== null);
  return { activityId, date, metric: 'apparent_temperature_celsius', points, metadata: result?.metadata ?? null };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  try {
    const body = await req.json();
    const action = body?.action;
    if (action === 'health') return jsonResponse({ success: true, data: { fortyGuardApiKeyConfigured: !!Deno.env.get('FORTYGUARD_API_KEY'), timestamp: new Date().toISOString() } });
    const latitude = Number(body?.latitude), longitude = Number(body?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return jsonResponse({ success: false, error: 'Valid latitude and longitude are required.' }, 400);
    const coordinates = { latitude, longitude };
    if (action === 'current-temperature') {
      const heatmap = await runHeatmap(coordinates);
      let environmental: any = null;
      let environmentalError: string | null = null;
      if (heatmap.temperature !== null) {
        try { environmental = await runEnvironmental(coordinates, heatmap.temperature, heatmap.dateTime); }
        catch (error) { environmentalError = error instanceof Error ? error.message : 'Environmental parameters failed.'; }
      } else environmentalError = 'Heatmap completed but no temperature value was available for env_params.';
      return jsonResponse({ success: true, action, data: { temperature: environmental?.temperature ?? heatmap.temperature, feelsLike: environmental?.apparentTemperature ?? null, humidity: environmental?.humidity ?? null, heatIndex: environmental?.heatIndex ?? null, wetBulbTemperature: environmental?.wetBulbTemperature ?? null, precipitation: environmental?.precipitation ?? null, cloudCover: environmental?.cloudCover ?? null, aqi: environmental?.aqi ?? null, solarIrradiance: environmental?.solarIrradiance ?? null, recordedAt: heatmap.recordedAt, coordinates, heatmapActivityId: heatmap.activityId, environmentalActivityId: environmental?.activityId ?? null, ...heatmap.diagnostics, environmentalError } });
    }
    if (action === 'environmental-parameters') {
      const temperature = Number(body?.temperature);
      if (!Number.isFinite(temperature)) return jsonResponse({ success: false, error: 'temperature is required for environmental-parameters.' }, 400);
      return jsonResponse({ success: true, action, data: await runEnvironmental(coordinates, temperature, getUtcDateTime()) });
    }
    if (action === 'temperature-trend') {
      const temperature = Number(body?.temperature);
      if (!Number.isFinite(temperature)) return jsonResponse({ success: false, error: 'temperature is required for temperature-trend.' }, 400);
      const date = typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : getUtcDate();
      return jsonResponse({ success: true, action, data: await runEnvironmentalTrend(coordinates, temperature, date) });
    }
    return jsonResponse({ success: false, error: 'Unknown action. Use current-temperature, environmental-parameters, temperature-trend, or health.' }, 400);
  } catch (error) {
    console.error('[FortyGuard] proxy error', error);
    if (error instanceof FortyGuardHttpError) return jsonResponse({ success: false, error: 'FortyGuard API error', message: error.message, endpoint: error.endpoint, status: error.status, body: error.safeBody }, 502);
    return jsonResponse({ success: false, error: 'Edge Function internal error', message: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});