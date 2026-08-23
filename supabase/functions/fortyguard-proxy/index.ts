declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FORTYGUARD_BASE_URL = 'https://api.fortyguard.com';
const MAX_POLLS = 60;
const POLL_DELAY_MS = 2000;

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
  const now = new Date();
  return { startDate: now.toISOString().slice(0, 10), startTime: now.toISOString().slice(11, 16) };
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

  const response = await fetch(`${FORTYGUARD_BASE_URL}${path}`, {
    ...init,
    headers: {
      'api-key': apiKey,
      ...(path.includes('/status/') ? {} : { 'Content-Type': 'application/json' }),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  let payload: any;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }

  if (!response.ok || payload?.error === true || payload?.error === 'true') {
    const message = payload?.message ?? payload?.error ?? response.statusText ?? 'FortyGuard request failed';
    const safeBody = text.length > 1500 ? `${text.slice(0, 1500)}...` : text;
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

      if (status === 'completed' || status === 'succeeded') {
        return { status: 'Completed' as const, result: statusData.result ?? null };
      }
      if (status === 'failed' || status === 'error') {
        throw new Error(statusData.message ?? `FortyGuard activity failed with status ${status}.`);
      }
    } catch (error) {
      if ((error as { status?: number })?.status !== 404) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
  }

  throw new Error(`FortyGuard activity timed out after ${(MAX_POLLS * POLL_DELAY_MS) / 1000}s (last status: ${lastStatus}).`);
}

function firstNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const n = Number(item);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    for (const key of ['value', 'Value', 'mean', 'Mean', 'average', 'Average', 'temperature', 'Temperature']) {
      if (key in object) {
        const n = firstNumeric(object[key]);
        if (n !== null) return n;
      }
    }
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractHeatmapTemperature(result: any): number | null {
  const stats = result?.stats_data ?? {};
  const temperatureStats = stats.Temperature_stats ?? stats.temperature_stats ?? stats.temperatureStats ?? {};

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
    const n = firstNumeric(candidate);
    if (n !== null) return n;
  }

  const distribution = stats.Overall_temperature_distribution;
  if (Array.isArray(distribution)) {
    const values = distribution.map(Number).filter(Number.isFinite);
    if (values.length) return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  const features = Array.isArray(result?.map_data?.features) ? result.map_data.features : [];
  const values: number[] = [];
  for (const feature of features) {
    const properties = feature?.properties ?? {};
    for (const key of [
      'average_temperature', 'avg_temperature', 'mean_temperature', 'temperature', 'Temperature',
      'temp', 'Temp', 'temperature_celsius', 'temperatureCelsius', 'value', 'Value',
    ]) {
      const n = firstNumeric(properties[key]);
      if (n !== null) { values.push(n); break; }
    }
  }
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

async function runHeatmap(coordinates: Coordinates) {
  const dateTime = getUtcDateTime();
  const requestBody = {
    polygon_aoi: buildPolygon(coordinates),
    date_time: { start_date: dateTime.startDate, start_time: dateTime.startTime, filter_type: 1 },
    granularity: 100,
    analytic_type: 'tcm',
  };

  console.log('[FortyGuard] HEATMAP REQUEST', JSON.stringify(requestBody));
  const submitted = await fortyGuardRequest('/v1/heatmap', { method: 'POST', body: JSON.stringify(requestBody) });
  const activityId = submitted?.data?.activity_id;
  if (!activityId) throw new Error('FortyGuard heatmap submission returned no activity_id.');

  const completed = await waitForActivity(activityId);
  const result = completed.result;
  const temperature = extractHeatmapTemperature(result);
  const stats = result?.stats_data ?? {};
  const features = Array.isArray(result?.map_data?.features) ? result.map_data.features : [];

  console.log('[FortyGuard] HEATMAP RESULT SUMMARY', JSON.stringify({
    activityId,
    status: completed.status,
    resultKeys: Object.keys(result ?? {}),
    statsKeys: Object.keys(stats),
    nCells: Number(stats.n_cells ?? 0),
    featuresCount: features.length,
    temperature,
  }));

  if (temperature === null) {
    throw new Error(
      `FortyGuard completed the heatmap but no temperature was found. ` +
      `Result keys: ${Object.keys(result ?? {}).join(', ')}`
    );
  }

  return {
    temperature,
    activityId,
    dateTime,
    recordedAt: new Date().toISOString(),
    resultKeys: Object.keys(result ?? {}),
    statsKeys: Object.keys(stats),
    nCells: Number(stats.n_cells ?? 0),
    featuresCount: features.length,
    resultSummary: {
      statsData: stats,
      firstFeature: features[0] ?? null,
    },
  };
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
    status: completed.status,
    temperature: firstNumeric(location.temperature) ?? temperature,
    heatIndex: firstNumeric(parameters.heat_index_celsius),
    apparentTemperature: firstNumeric(parameters.apparent_temperature_celsius),
    humidity: firstNumeric(parameters.relative_humidity_percent),
    precipitation: firstNumeric(parameters.precipitation_mm),
    wetBulbTemperature: firstNumeric(parameters.wet_bulb_temperature_celsius),
    cloudCover: firstNumeric(parameters.cloud_cover_octas),
    aqi: firstNumeric(parameters['air_quality:idx']),
    aqiUsCo: firstNumeric(parameters.aqi_us_co),
    solarIrradiance: location.solar_irradiance ?? null,
    metadata: result?.metadata ?? null,
    resultKeys: Object.keys(result ?? {}),
    parameterKeys: Object.keys(parameters),
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

    if (action === 'current-temperature') {
      const heatmap = await runHeatmap(coordinates);
      let environmental: Awaited<ReturnType<typeof runEnvironmental>> | null = null;
      let environmentalError: string | null = null;

      try {
        environmental = await runEnvironmental(coordinates, heatmap.temperature, heatmap.dateTime);
      } catch (error) {
        environmentalError = error instanceof Error ? error.message : 'Environmental parameters failed.';
        console.warn('[FortyGuard] Environmental request failed:', environmentalError);
      }

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
          aqiUsCo: environmental?.aqiUsCo ?? null,
          solarIrradiance: environmental?.solarIrradiance ?? null,
          recordedAt: heatmap.recordedAt,
          coordinates,
          heatmapActivityId: heatmap.activityId,
          environmentalActivityId: environmental?.activityId ?? null,
          resultKeys: heatmap.resultKeys,
          statsKeys: heatmap.statsKeys,
          nCells: heatmap.nCells,
          featuresCount: heatmap.featuresCount,
          heatmapResultSummary: heatmap.resultSummary,
          environmentalResultKeys: environmental?.resultKeys ?? [],
          environmentalParameterKeys: environmental?.parameterKeys ?? [],
          environmentalError,
          pipeline: {
            heatmapSubmitted: true,
            heatmapCompleted: true,
            temperatureExtracted: true,
            environmentalSubmitted: !!environmental || !!environmentalError,
            environmentalCompleted: !!environmental,
          },
        },
      });
    }

    if (action === 'environmental-parameters') {
      const temperature = Number(body?.temperature);
      if (!Number.isFinite(temperature)) return jsonResponse({ success: false, error: 'temperature is required.' }, 400);
      const environmental = await runEnvironmental(coordinates, temperature, getUtcDateTime());
      return jsonResponse({ success: true, action, data: environmental });
    }

    if (action === 'heatmap') {
      const heatmap = await runHeatmap(coordinates);
      return jsonResponse({ success: true, action, data: heatmap });
    }

    return jsonResponse({ success: false, error: 'Unknown action. Use current-temperature, environmental-parameters, or heatmap.' }, 400);
  } catch (error) {
    console.error('[FortyGuard] proxy error:', error);
    if (error instanceof FortyGuardHttpError) {
      return jsonResponse({ success: false, error: 'FortyGuard API error', message: error.message, endpoint: error.endpoint, status: error.status, body: error.safeBody }, 502);
    }
    return jsonResponse({ success: false, error: 'Edge Function internal error', message: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
