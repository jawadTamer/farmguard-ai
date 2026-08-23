declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FORTYGUARD_BASE_URL = 'https://api.fortyguard.com';
const MAX_POLLS = 45;
const POLL_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 30_000;

type Coordinates = { latitude: number; longitude: number };
type DateTime = { startDate: string; startTime: string };

type FortyGuardErrorBody = {
  status: number;
  endpoint: string;
  message: string;
  body: string;
};

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

function buildPolygon({ latitude, longitude }: Coordinates) {
  // Small square (~1 km²) around the farm point; safely below the Basic plan area limit.
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
  if (!apiKey) {
    throw new Error('FORTYGUARD_API_KEY is not configured in Supabase Edge Function secrets.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${FORTYGUARD_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'api-key': apiKey,
        'Accept': 'application/json',
        ...(init.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }

    if (!response.ok || payload?.error === true || payload?.error === 'true') {
      const message = payload?.message ?? payload?.error ?? response.statusText ?? 'FortyGuard request failed';
      const safeBody = text.length > 2000 ? `${text.slice(0, 2000)}...` : text;
      throw new FortyGuardHttpError(response.status, path, String(message), safeBody);
    }

    return payload;
  } catch (error) {
    if (error instanceof FortyGuardHttpError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`FortyGuard request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${path}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForActivity(activityId: string) {
  let lastStatus = 'unknown';
  let lastResult: any = null;

  for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
    try {
      const payload = await fortyGuardRequest(`/v1/status/${activityId}`, { method: 'GET' });
      const statusData = payload?.data ?? {};
      const status = String(statusData.status ?? '').toLowerCase().trim();
      lastStatus = status || 'unknown';
      lastResult = statusData.result ?? null;

      console.log('[FortyGuard] STATUS', JSON.stringify({
        activityId,
        attempt,
        maxPolls: MAX_POLLS,
        status: lastStatus,
      }));

      if (status === 'completed' || status === 'succeeded') {
        return {
          status: 'Completed' as const,
          result: statusData.result ?? null,
          raw: payload,
        };
      }

      if (status === 'failed' || status === 'error') {
        throw new Error(statusData.message ?? `FortyGuard activity failed with status ${status}.`);
      }
    } catch (error) {
      // FortyGuard documents 404 as possible immediately after submission.
      // Retry it instead of failing the whole Edge Function.
      if (error instanceof FortyGuardHttpError && error.status === 404) {
        console.warn(`[FortyGuard] status endpoint returned 404; retrying activity ${activityId}`);
      } else {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
  }

  throw new Error(
    `FortyGuard activity ${activityId} timed out after ${(MAX_POLLS * POLL_DELAY_MS) / 1000}s. ` +
    `Last status: ${lastStatus}. Result received: ${lastResult !== null}`,
  );
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
    for (const key of [
      'value', 'Value', 'mean', 'Mean', 'average', 'Average',
      'temperature', 'Temperature', 'min', 'Min', 'max', 'Max',
    ]) {
      if (key in object) {
        const number = firstNumeric(object[key]);
        if (number !== null) return number;
      }
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
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function extractHeatmapTemperature(result: any): number | null {
  if (!result || typeof result !== 'object') return null;

  const stats = result.stats_data ?? {};
  const temperatureStats =
    stats.Temperature_stats ??
    stats.temperature_stats ??
    stats.temperatureStats ??
    {};

  // Documented field: stats_data.Temperature_stats.Mean.
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

  // Documented distribution fallback.
  const distributionMean = meanOfNumericArray(stats.Overall_temperature_distribution);
  if (distributionMean !== null) return distributionMean;

  // Real heatmap responses also contain tile-level average_temperature values.
  const features = Array.isArray(result.map_data?.features) ? result.map_data.features : [];
  const values: number[] = [];
  const temperatureKeys = [
    'average_temperature',
    'avg_temperature',
    'mean_temperature',
    'temperature',
    'Temperature',
    'temp',
    'Temp',
    'temperature_celsius',
    'temperatureCelsius',
    'value',
    'Value',
  ];

  for (const feature of features) {
    const properties = feature?.properties ?? {};
    for (const key of temperatureKeys) {
      const number = firstNumeric(properties[key]);
      if (number !== null) {
        values.push(number);
        break;
      }
    }
  }

  if (values.length) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  return null;
}

async function runHeatmap(coordinates: Coordinates) {
  const dateTime = getUtcDateTime();
  const requestBody = {
    polygon_aoi: buildPolygon(coordinates),
    date_time: {
      start_date: dateTime.startDate,
      start_time: dateTime.startTime,
      filter_type: 1,
    },
    granularity: 100,
    // Do not force analytic_type here. FortyGuard defaults heatmap to TCM.
  };

  console.log('[FortyGuard] HEATMAP SUBMIT', JSON.stringify(requestBody));

  const submitted = await fortyGuardRequest('/v1/heatmap', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });

  const activityId = submitted?.data?.activity_id;
  if (!activityId) {
    throw new Error(`FortyGuard heatmap submission returned no activity_id. Response: ${JSON.stringify(submitted)}`);
  }

  const completed = await waitForActivity(activityId);
  const result = completed.result;
  const stats = result?.stats_data ?? {};
  const features = Array.isArray(result?.map_data?.features) ? result.map_data.features : [];
  const temperature = extractHeatmapTemperature(result);

  const diagnostics = {
    activityId,
    status: completed.status,
    resultReceived: !!result,
    resultKeys: Object.keys(result ?? {}),
    statsKeys: Object.keys(stats),
    featuresCount: features.length,
    nCells: Number(stats.n_cells ?? 0),
    firstFeatureTemperature: firstNumeric(features[0]?.properties?.average_temperature),
  };

  console.log('[FortyGuard] HEATMAP COMPLETE', JSON.stringify({ ...diagnostics, temperature }));

  if (temperature === null) {
    throw new Error(
      `FortyGuard completed the heatmap but no temperature could be extracted. ` +
      `Result keys: ${diagnostics.resultKeys.join(', ') || 'none'}; ` +
      `Stats keys: ${diagnostics.statsKeys.join(', ') || 'none'}; ` +
      `Features: ${diagnostics.featuresCount}`,
    );
  }

  return {
    temperature,
    activityId,
    dateTime,
    recordedAt: new Date().toISOString(),
    result,
    diagnostics,
  };
}

async function runEnvironmental(
  coordinates: Coordinates,
  temperature: number,
  dateTime: DateTime,
) {
  const requestBody = {
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    temperature,
    date_time: {
      start_date: dateTime.startDate,
      start_time: dateTime.startTime,
      filter_type: 1,
    },
  };

  console.log('[FortyGuard] ENV SUBMIT', JSON.stringify(requestBody));

  const submitted = await fortyGuardRequest('/v1/env_params', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });

  const activityId = submitted?.data?.activity_id;
  if (!activityId) {
    throw new Error(`FortyGuard environmental submission returned no activity_id. Response: ${JSON.stringify(submitted)}`);
  }

  const completed = await waitForActivity(activityId);
  const result = completed.result;
  const location = result?.locations?.[0] ?? {};
  const parameters = location?.parameters ?? {};

  const environmental = {
    activityId,
    status: completed.status,
    resultReceived: !!result,
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

  console.log('[FortyGuard] ENV COMPLETE', JSON.stringify({
    activityId,
    resultKeys: environmental.resultKeys,
    parameterKeys: environmental.parameterKeys,
    temperature: environmental.temperature,
    humidity: environmental.humidity,
  }));

  return environmental;
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
      return jsonResponse({
        success: true,
        action,
        data: {
          fortyGuardApiKeyConfigured: !!Deno.env.get('FORTYGUARD_API_KEY'),
          baseUrl: FORTYGUARD_BASE_URL,
          timestamp: new Date().toISOString(),
        },
      });
    }

    if (action === 'current-temperature') {
      const heatmap = await runHeatmap(coordinates);
      let environmental: Awaited<ReturnType<typeof runEnvironmental>> | null = null;
      let environmentalError: FortyGuardErrorBody | string | null = null;

      try {
        environmental = await runEnvironmental(coordinates, heatmap.temperature, heatmap.dateTime);
      } catch (error) {
        environmentalError = error instanceof FortyGuardHttpError
          ? {
              status: error.status,
              endpoint: error.endpoint,
              message: error.message,
              body: error.safeBody,
            }
          : error instanceof Error
            ? error.message
            : 'Environmental parameters failed.';
        console.warn('[FortyGuard] ENV FAILED', JSON.stringify(environmentalError));
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
          resultKeys: heatmap.diagnostics.resultKeys,
          statsKeys: heatmap.diagnostics.statsKeys,
          nCells: heatmap.diagnostics.nCells,
          featuresCount: heatmap.diagnostics.featuresCount,
          heatmapResult: heatmap.result,
          environmentalResult: environmental,
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

    if (action === 'heatmap') {
      const heatmap = await runHeatmap(coordinates);
      return jsonResponse({
        success: true,
        action,
        data: {
          temperature: heatmap.temperature,
          activityId: heatmap.activityId,
          recordedAt: heatmap.recordedAt,
          diagnostics: heatmap.diagnostics,
          result: heatmap.result,
        },
      });
    }

    if (action === 'environmental-parameters') {
      const temperature = Number(body?.temperature);
      if (!Number.isFinite(temperature)) {
        return jsonResponse({ success: false, error: 'temperature is required.' }, 400);
      }

      const environmental = await runEnvironmental(coordinates, temperature, getUtcDateTime());
      return jsonResponse({ success: true, action, data: environmental });
    }

    return jsonResponse({
      success: false,
      error: 'Unknown action. Use health, current-temperature, environmental-parameters, or heatmap.',
    }, 400);
  } catch (error) {
    console.error('[FortyGuard] PROXY FAILED', error);

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
