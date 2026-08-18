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

class FortyGuardHttpError extends Error {
  status: number;
  endpoint: string;
  safeBody: string;

  constructor(status: number, endpoint: string, message: string, safeBody: string) {
    super(message);
    this.name = 'FortyGuardHttpError';
    this.status = status;
    this.endpoint = endpoint;
    this.safeBody = safeBody;
  }
}

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
  if (!apiKey) {
    console.error('[FortyGuard] FORTYGUARD_API_KEY is not configured in Supabase secrets.');
    throw new Error('FORTYGUARD_API_KEY is not configured in Supabase secrets.');
  }

  console.log(`[FortyGuard] Requesting: ${FORTYGUARD_BASE_URL}${path}`);
  const response = await fetch(`${FORTYGUARD_BASE_URL}${path}`, {
    ...init,
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

  const text = await response.text();
  console.log(`[FortyGuard] Response status: ${response.status}, body length: ${text.length}`);
  
  let payload: any;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  
  if (!response.ok) {
    const safeBody = text.length > 500 ? text.substring(0, 500) + '...' : text;
    const message = payload?.message ?? payload?.error ?? response.statusText ?? 'Unknown error';
    
    console.error('[FortyGuard] API error:', {
      endpoint: path,
      status: response.status,
      statusText: response.statusText,
      body: safeBody
    });
    
    throw new FortyGuardHttpError(response.status, path, message, safeBody);
  }
  
  console.log(`[FortyGuard] Request succeeded`);
  return payload;
}

async function waitForActivity(activityId: string) {
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    try {
      const payload = await fortyGuardRequest(`/v1/status/${activityId}`, { method: 'GET' });
      const status = String(payload?.data?.status ?? '').toLowerCase().trim();
      console.log(`[FortyGuard] Status check attempt ${attempt + 1}: ${status}`);
      
      if (status === 'completed' || status === 'succeeded') {
        console.log('[FortyGuard] Activity completed successfully');
        return payload?.data?.result ?? null;
      }
      
      if (status === 'failed' || status === 'error') {
        const message = payload?.data?.message ?? 'FortyGuard activity failed.';
        console.error('[FortyGuard] Activity failed:', message);
        throw new Error(message);
      }
    } catch (error) {
      const errorStatus = (error as { status?: number })?.status;
      if (errorStatus !== 404) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
  }
  throw new Error('FortyGuard activity timed out while waiting for completion.');
}

function firstNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  
  // Handle arrays - take first finite numeric value
  if (Array.isArray(value)) {
    for (const item of value) {
      const num = Number(item);
      if (Number.isFinite(num)) return num;
    }
    return null;
  }
  
  // Handle strings
  if (typeof value === 'string') {
    const num = Number(value.trim());
    return Number.isFinite(num) ? num : null;
  }
  
  // Handle numbers
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function extractMeanTemperature(result: any): number | null {
  // Log safe summary of result structure for debugging
  const hasMapData = !!result?.map_data;
  const featureCount = Array.isArray(result?.map_data?.features) ? result.map_data.features.length : 0;
  const mapPropertyKeys = featureCount > 0 ? Object.keys(result.map_data.features[0].properties || {}) : [];
  const statsDataKeys = result?.stats_data ? Object.keys(result.stats_data) : [];
  const temperatureStatsKeys = result?.stats_data?.Temperature_stats ? Object.keys(result.stats_data.Temperature_stats) : [];
  const temperatureStatsLowerKeys = result?.stats_data?.temperature_stats ? Object.keys(result.stats_data.temperature_stats) : [];
  
  console.log('[FortyGuard] Result structure summary:', {
    hasMapData,
    featureCount,
    mapPropertyKeys,
    statsDataKeys,
    temperatureStatsKeys,
    temperatureStatsLowerKeys
  });

  // Priority A: result.stats_data.Temperature_stats.Mean
  let temp = firstNumeric(result?.stats_data?.Temperature_stats?.Mean);
  if (temp !== null) {
    console.log('[FortyGuard] Extracted from Temperature_stats.Mean:', temp);
    return temp;
  }

  // Priority B: result.stats_data.Temperature_stats.mean
  temp = firstNumeric(result?.stats_data?.Temperature_stats?.mean);
  if (temp !== null) {
    console.log('[FortyGuard] Extracted from Temperature_stats.mean:', temp);
    return temp;
  }

  // Priority C: result.stats_data.temperature_stats.Mean
  temp = firstNumeric(result?.stats_data?.temperature_stats?.Mean);
  if (temp !== null) {
    console.log('[FortyGuard] Extracted from temperature_stats.Mean:', temp);
    return temp;
  }

  // Priority D: result.stats_data.temperature_stats.mean
  temp = firstNumeric(result?.stats_data?.temperature_stats?.mean);
  if (temp !== null) {
    console.log('[FortyGuard] Extracted from temperature_stats.mean:', temp);
    return temp;
  }

  // Priority E: result.stats_data.temperatureStats.Mean
  temp = firstNumeric(result?.stats_data?.temperatureStats?.Mean);
  if (temp !== null) {
    console.log('[FortyGuard] Extracted from temperatureStats.Mean:', temp);
    return temp;
  }

  // Priority F: result.stats_data.temperatureStats.mean
  temp = firstNumeric(result?.stats_data?.temperatureStats?.mean);
  if (temp !== null) {
    console.log('[FortyGuard] Extracted from temperatureStats.mean:', temp);
    return temp;
  }

  // Priority G: Search map_data features for common temperature property names
  if (featureCount > 0) {
    const tempProps = [
      'average_temperature', 'avg_temperature', 'mean_temperature',
      'temperature', 'Temperature', 'temp', 'Temp',
      'temperature_celsius', 'temperatureCelsius',
      'value', 'Value'
    ];
    
    for (const feature of result.map_data.features) {
      const props = feature?.properties || {};
      for (const prop of tempProps) {
        temp = firstNumeric(props[prop]);
        if (temp !== null) {
          console.log(`[FortyGuard] Extracted from feature.${prop}:`, temp);
          return temp;
        }
      }
    }
  }

  console.warn('[FortyGuard] Could not extract temperature from any known path');
  return null;
}

async function getCurrentTemperature(coordinates: Coordinates) {
  console.log(`[FortyGuard] Requesting current temperature for coordinates: ${coordinates.latitude}, ${coordinates.longitude}`);
  const dateTime = getUtcDateTime();
  console.log(`[FortyGuard] Using date_time: ${dateTime.startDate} ${dateTime.startTime}`);
  const submitted = await fortyGuardRequest('/v1/heatmap', {
    method: 'POST',
    body: JSON.stringify({ polygon_aoi: buildPointFeatureCollection(coordinates), date_time: { start_date: dateTime.startDate, start_time: dateTime.startTime, filter_type: 1 }, granularity: 100, analytic_type: 'tcm' }),
  });
  const activityId = submitted?.data?.activity_id;
  if (!activityId) throw new Error('FortyGuard did not return an activity_id for the heatmap request.');
  console.log(`[FortyGuard] Heatmap submitted, activity_id: ${activityId}`);
  const result = await waitForActivity(activityId);
  
  // Log comprehensive result structure for debugging
  console.log('[FortyGuard] COMPLETED HEATMAP RESULT:', JSON.stringify(result));
  console.log('[FortyGuard] Result top-level keys:', Object.keys(result || {}));
  console.log('[FortyGuard] stats_data keys:', result?.stats_data ? Object.keys(result.stats_data) : 'none');
  console.log('[FortyGuard] map_data feature count:', Array.isArray(result?.map_data?.features) ? result.map_data.features.length : 0);
  if (result?.map_data?.features?.[0]) {
    console.log('[FortyGuard] First feature properties:', Object.keys(result.map_data.features[0].properties || {}));
  }
  
  const temperature = extractMeanTemperature(result);
  if (temperature === null) {
    const errorDetails = {
      activityId,
      resultKeys: Object.keys(result || {}),
      hasStatsData: !!result?.stats_data,
      hasMapData: !!result?.map_data,
      statsDataKeys: result?.stats_data ? Object.keys(result.stats_data) : [],
      featureCount: Array.isArray(result?.map_data?.features) ? result.map_data.features.length : 0
    };
    console.error('[FortyGuard] Temperature extraction failed with details:', errorDetails);
    throw new Error(JSON.stringify(errorDetails));
  }
  console.log(`[FortyGuard] Extracted temperature: ${temperature}°C`);
  return { temperature, recordedAt: new Date().toISOString(), activityId, dateTime };
}

async function getEnvironmentalParameters(coordinates: Coordinates, temperature: number, dateTime: { startDate: string; startTime: string }) {
  console.log(`[FortyGuard] Requesting environmental parameters for coordinates: ${coordinates.latitude}, ${coordinates.longitude}`);
  const submitted = await fortyGuardRequest('/v1/env_params', {
    method: 'POST',
    body: JSON.stringify({ latitude: coordinates.latitude, longitude: coordinates.longitude, temperature, date_time: { start_date: dateTime.startDate, start_time: dateTime.startTime, filter_type: 1 } }),
  });
  const activityId = submitted?.data?.activity_id;
  if (!activityId) throw new Error('FortyGuard did not return an activity_id for environmental parameters.');
  console.log(`[FortyGuard] Environmental parameters activity_id: ${activityId}`);
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
    cloudCover: firstNumeric(parameters.cloud_cover_metric),
    aqi: firstNumeric(parameters.aqi_us),
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
    console.log(`[FortyGuard] Received request - action: ${action}, latitude: ${latitude}, longitude: ${longitude}`);
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
    
    // Check if this is a temperature extraction error (JSON stringified details)
    if (error instanceof Error && error.message.startsWith('{')) {
      try {
        const errorDetails = JSON.parse(error.message);
        return jsonResponse({
          success: false,
          error: 'FortyGuard result parsing error',
          message: 'Could not extract temperature from heatmap result',
          activityId: errorDetails.activityId,
          resultKeys: errorDetails.resultKeys,
          hasStatsData: errorDetails.hasStatsData,
          hasMapData: errorDetails.hasMapData,
          statsDataKeys: errorDetails.statsDataKeys,
          featureCount: errorDetails.featureCount
        }, 502);
      } catch (parseError) {
        // If parsing fails, return generic error
      }
    }
    
    if (error instanceof FortyGuardHttpError) {
      return jsonResponse({
        success: false,
        error: 'FortyGuard API error',
        message: error.message,
        endpoint: error.endpoint,
        status: error.status,
        body: error.safeBody
      }, error.status);
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({
      success: false,
      error: 'Edge Function internal error',
      message: errorMessage
    }, 500);
  }
});
