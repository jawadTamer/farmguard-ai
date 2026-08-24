declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BASE_URL = 'https://api.fortyguard.com';
const MAX_POLLS = 60;
const POLL_DELAY_MS = 1500;
const REQUEST_TIMEOUT_MS = 30000;
const TREND_CONCURRENCY = 3;

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

function getUtcDateTime(): DateTime {
  const date = new Date(Date.now() - 60 * 60 * 1000);
  date.setUTCMinutes(0, 0, 0);
  return { startDate: date.toISOString().slice(0, 10), startTime: date.toISOString().slice(11, 16) };
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
    try {
      const payload = await fg(`/v1/status/${activityId}`, { method: 'GET' });
      const data = payload?.data ?? payload ?? {};
      const status = String(data?.status ?? payload?.status ?? '').toLowerCase().trim();
      lastStatus = status || 'unknown';
      if (['completed', 'succeeded', 'success'].includes(status)) {
        return { result: data?.result ?? payload?.result ?? null, raw: payload };
      }
      if (['failed', 'error'].includes(status)) {
        throw new Error(data?.message ?? payload?.message ?? `FortyGuard activity failed with status ${status}.`);
      }
    } catch (error) {
      if (!(error instanceof FortyGuardHttpError) || error.status !== 404) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, POLL_DELAY_MS));
  }
  throw new Error(`FortyGuard activity ${activityId} timed out. Last status: ${lastStatus}.`);
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const n = num(item);
      if (n !== null) return n;
    }
    return null;
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    for (const key of ['value', 'Value', 'mean', 'Mean', 'average', 'Average', 'temperature', 'Temperature']) {
      const n = num(object[key]);
      if (n !== null) return n;
    }
    return null;
  }
  const n = Number(value);
  if (n === -999) return null;
  return Number.isFinite(n) ? n : null;
}

function mean(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function extractMeanTemperature(result: any): number | null {
  const stats = result?.stats_data ?? result?.statsData ?? {};
  const temperatureStats = stats?.Temperature_stats ?? stats?.temperature_stats ?? stats?.temperatureStats ?? {};
  for (const candidate of [temperatureStats?.Mean, temperatureStats?.mean, temperatureStats?.Average, temperatureStats?.average, stats?.mean_temperature, stats?.average_temperature]) {
    const n = num(candidate);
    if (n !== null) return n;
  }
  const distribution = stats?.Overall_temperature_distribution ?? stats?.overall_temperature_distribution;
  if (Array.isArray(distribution)) {
    const values = distribution.map(num).filter((n): n is number => n !== null);
    const n = mean(values);
    if (n !== null) return n;
  }
  const features = Array.isArray(result?.map_data?.features) ? result.map_data.features : [];
  const values: number[] = [];
  for (const feature of features) {
    const properties = feature?.properties ?? {};
    const n = num(properties?.average_temperature ?? properties?.avg_temperature ?? properties?.mean_temperature ?? properties?.temperature ?? properties?.Temperature ?? properties?.temp);
    if (n !== null) values.push(n);
  }
  return mean(values);
}

async function heatmap(coordinates: Coordinates, dateTime = getUtcDateTime()) {
  const submitted = await fg('/v1/heatmap', {
    method: 'POST',
    body: JSON.stringify({
      polygon_aoi: buildPolygon(coordinates),
      date_time: { start_date: dateTime.startDate, start_time: dateTime.startTime, filter_type: 1 },
      granularity: 100,
      analytic_type: 'tcm',
    }),
  });
  const activityId = submitted?.data?.activity_id ?? submitted?.activity_id;
  if (!activityId) throw new Error('FortyGuard heatmap submission returned no activity_id.');
  const completed = await waitForActivity(activityId);
  const result = completed.result;
  return { result, activityId, temperature: extractMeanTemperature(result), dateTime, recordedAt: new Date().toISOString() };
}

async function env(coordinates: Coordinates, temperature: number, dateTime: DateTime) {
  const submitted = await fg('/v1/env_params', {
    method: 'POST',
    body: JSON.stringify({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      temperature,
      date_time: { start_date: dateTime.startDate, start_time: dateTime.startTime, filter_type: 1 },
    }),
  });
  const activityId = submitted?.data?.activity_id ?? submitted?.activity_id;
  if (!activityId) throw new Error('FortyGuard environmental submission returned no activity_id.');
  const completed = await waitForActivity(activityId);
  const result = completed.result;
  const location = result?.locations?.[0] ?? {};
  const parameters = location?.parameters ?? {};
  return {
    activityId,
    resultReceived: !!result,
    temperature: num(location.temperature) ?? temperature,
    heatIndex: num(parameters.heat_index_celsius),
    apparentTemperature: num(parameters.apparent_temperature_celsius),
    humidity: num(parameters.relative_humidity_percent),
    precipitation: num(parameters.precipitation_mm),
    wetBulbTemperature: num(parameters.wet_bulb_temperature_celsius),
    cloudCover: num(parameters.cloud_cover_octas ?? parameters.cloud_cover_metric),
    aqi: num(parameters['air_quality:idx'] ?? parameters.aqi_us),
    solarIrradiance: location.solar_irradiance ?? null,
    metadata: result?.metadata ?? null,
  };
}

function getLastCompletedHours(hours = 12): DateTime[] {
  const count = Math.min(Math.max(Math.floor(hours), 1), 12);
  const current = new Date();
  current.setUTCMinutes(0, 0, 0);
  current.setUTCHours(current.getUTCHours() - 1);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(current.getTime() - (count - 1 - index) * 60 * 60 * 1000);
    return { startDate: date.toISOString().slice(0, 10), startTime: date.toISOString().slice(11, 16) };
  });
}

async function runWithConcurrency<T>(items: DateTime[], worker: (item: DateTime) => Promise<T>, concurrency: number) {
  const output: PromiseSettledResult<T>[] = new Array(items.length);
  let nextIndex = 0;
  async function runner() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        output[index] = { status: 'fulfilled', value: await worker(items[index]) };
      } catch (reason) {
        output[index] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runner()));
  return output;
}

async function temperatureTrend(coordinates: Coordinates, hours = 12) {
  const requestedHours = Math.min(Math.max(Math.floor(hours), 1), 12);
  const targets = getLastCompletedHours(requestedHours);

  // IMPORTANT: do not Promise.all 12 FortyGuard activities here. A burst of 12
  // asynchronous jobs in one Supabase Edge Function can hit WORKER_RESOURCE_LIMIT.
  // Keep only three upstream activities in flight at once.
  const results = await runWithConcurrency(targets, async target => {
    const item = await heatmap(coordinates, target);
    if (item.temperature === null) throw new Error(`No temperature returned for ${target.startDate} ${target.startTime}.`);
    return {
      timestamp: `${target.startDate}T${target.startTime}:00Z`,
      temperature: Number(item.temperature.toFixed(1)),
      activityId: item.activityId,
    };
  }, TREND_CONCURRENCY);

  const points = results
    .filter((result): result is PromiseFulfilledResult<{ timestamp: string; temperature: number; activityId: string }> => result.status === 'fulfilled')
    .map(result => result.value)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const failed = results
    .map((result, index) => result.status === 'rejected' ? {
      timestamp: `${targets[index].startDate}T${targets[index].startTime}:00Z`,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    } : null)
    .filter(Boolean);

  return {
    resultReceived: points.length > 0,
    requestedHours,
    returnedHours: points.length,
    points,
    failed,
    source: 'FortyGuard heatmap single-hour',
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
      const heatmapResult = await heatmap(coordinates);
      let environmental: Awaited<ReturnType<typeof env>> | null = null;
      let environmentalError: string | null = null;
      if (heatmapResult.temperature !== null) {
        try {
          environmental = await env(coordinates, heatmapResult.temperature, heatmapResult.dateTime);
        } catch (error) {
          environmentalError = error instanceof Error ? error.message : 'Environmental parameters failed.';
          console.warn('[FortyGuard] env_params failed; returning heatmap temperature only.', error);
        }
      }
      return jsonResponse({ success: true, action, data: {
        resultReceived: !!heatmapResult.result,
        temperature: environmental?.temperature ?? heatmapResult.temperature,
        temperatureSource: 'heatmap',
        feelsLike: environmental?.apparentTemperature ?? null,
        humidity: environmental?.humidity ?? null,
        heatIndex: environmental?.heatIndex ?? null,
        wetBulbTemperature: environmental?.wetBulbTemperature ?? null,
        precipitation: environmental?.precipitation ?? null,
        cloudCover: environmental?.cloudCover ?? null,
        aqi: environmental?.aqi ?? null,
        solarIrradiance: environmental?.solarIrradiance ?? null,
        recordedAt: heatmapResult.recordedAt,
        coordinates,
        heatmapActivityId: heatmapResult.activityId,
        environmentalActivityId: environmental?.activityId ?? null,
        environmentalResultReceived: environmental?.resultReceived ?? false,
        environmentalError,
      }});
    }

    if (action === 'environmental-parameters') {
      const temperature = Number(body?.temperature);
      if (!Number.isFinite(temperature)) return jsonResponse({ success: false, error: 'temperature is required for environmental-parameters.' }, 400);
      return jsonResponse({ success: true, action, data: await env(coordinates, temperature, getUtcDateTime()) });
    }

    if (action === 'temperature-trend') {
      const requestedHours = Number(body?.hours ?? 12);
      const trend = await temperatureTrend(coordinates, Number.isFinite(requestedHours) ? requestedHours : 12);
      return jsonResponse({ success: true, action, data: trend });
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