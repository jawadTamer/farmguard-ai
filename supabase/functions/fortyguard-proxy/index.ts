declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

type Coordinates = { latitude: number; longitude: number };
type DateTime = { startDate: string; startTime: string };

const BASE_URL = 'https://api.fortyguard.com';
const REQUEST_TIMEOUT_MS = 12_000;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function previousHour(): DateTime {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() - 1);
  return { startDate: d.toISOString().slice(0, 10), startTime: d.toISOString().slice(11, 16) };
}

function addHours(value: DateTime, hours: number): DateTime {
  const d = new Date(`${value.startDate}T${value.startTime}:00Z`);
  d.setUTCHours(d.getUTCHours() + hours);
  return { startDate: d.toISOString().slice(0, 10), startTime: d.toISOString().slice(11, 16) };
}

function validCoordinates(value: any): value is Coordinates {
  return Number.isFinite(Number(value?.latitude)) && Number.isFinite(Number(value?.longitude))
    && Number(value.latitude) >= -90 && Number(value.latitude) <= 90
    && Number(value.longitude) >= -180 && Number(value.longitude) <= 180;
}

function polygon(c: Coordinates) {
  const d = 0.0015;
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature', properties: {},
      geometry: { type: 'Polygon', coordinates: [[
        [c.longitude - d, c.latitude - d], [c.longitude + d, c.latitude - d],
        [c.longitude + d, c.latitude + d], [c.longitude - d, c.latitude + d],
        [c.longitude - d, c.latitude - d],
      ]] },
    }],
  };
}

async function fg(path: string, init: RequestInit = {}) {
  const key = Deno.env.get('FORTYGUARD_API_KEY');
  if (!key) throw new Error('FORTYGUARD_API_KEY is not configured.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'api-key': key,
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
        text.slice(0, 2000),
      );
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function activityId(payload: any): string {
  const id = payload?.data?.activity_id ?? payload?.activity_id;
  if (!id) throw new Error('FortyGuard did not return activity_id.');
  return String(id);
}

function numberValue(value: unknown): number | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const n = numberValue(item);
      if (n !== null) return n;
    }
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) && n !== -999 ? n : null;
}

function round1(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(1));
}

function extractHeatmapTemperature(result: any): number | null {
  const stats = result?.stats_data ?? result?.statsData ?? {};
  const ts = stats?.Temperature_stats ?? stats?.temperature_stats ?? stats?.temperatureStats ?? {};
  for (const value of [ts?.Mean, ts?.mean, ts?.Average, ts?.average, stats?.mean_temperature, stats?.average_temperature]) {
    const n = numberValue(value);
    if (n !== null) return n;
  }
  const distribution = stats?.Overall_temperature_distribution ?? stats?.overall_temperature_distribution;
  if (Array.isArray(distribution)) {
    const values = distribution.map(numberValue).filter((x): x is number => x !== null);
    if (values.length) return values.reduce((a, b) => a + b, 0) / values.length;
  }
  const features = Array.isArray(result?.map_data?.features) ? result.map_data.features : [];
  const values = features
    .map((f: any) => numberValue(f?.properties?.average_temperature ?? f?.properties?.avg_temperature ?? f?.properties?.temperature ?? f?.properties?.value))
    .filter((x: number | null): x is number => x !== null);
  return values.length ? values.reduce((a: number, b: number) => a + b, 0) / values.length : null;
}

function normalizeStatus(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function isCompleted(status: string) {
  return ['completed', 'complete', 'succeeded', 'success'].includes(status);
}

function isFailed(status: string) {
  return ['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(status);
}

async function getStatus(id: string) {
  const payload = await fg(`/v1/status/${encodeURIComponent(id)}`, { method: 'GET' });
  const data = payload?.data ?? payload ?? {};
  return {
    activityId: id,
    status: normalizeStatus(data?.status ?? payload?.status),
    result: data?.result ?? payload?.result ?? null,
    message: data?.message ?? payload?.message ?? null,
  };
}

async function submitHeatmap(c: Coordinates, dateTime = previousHour()) {
  const payload = await fg('/v1/heatmap', {
    method: 'POST',
    body: JSON.stringify({
      polygon_aoi: polygon(c),
      date_time: { start_date: dateTime.startDate, start_time: dateTime.startTime, filter_type: 1 },
      granularity: 60,
      analytic_type: 'tcm',
    }),
  });
  return { activityId: activityId(payload), dateTime };
}

async function submitTrend(c: Coordinates, temperature: number, hours: number) {
  const count = Math.max(1, Math.min(12, Math.floor(hours)));
  const end = previousHour();
  const start = addHours(end, -(count - 1));
  const payload = await fg('/v1/env_params', {
    method: 'POST',
    body: JSON.stringify({
      latitude: c.latitude,
      longitude: c.longitude,
      temperature,
      date_time: {
        start_date: start.startDate,
        start_time: start.startTime,
        end_date: end.startDate,
        end_time: end.startTime,
        filter_type: 2,
      },
      analysis: [
        'apparent_temperature_celsius',
        'heat_index_celsius',
        'relative_humidity_percent',
      ],
    }),
  });
  return { activityId: activityId(payload), start, end, requestedHours: count };
}

function trendPoints(result: any) {
  const metadata = result?.metadata ?? {};
  const location = result?.locations?.[0] ?? {};
  const p = location?.parameters ?? {};
  const timestamps = Array.isArray(metadata?.timestamps) ? metadata.timestamps : [];
  const apparent = Array.isArray(p?.apparent_temperature_celsius) ? p.apparent_temperature_celsius : [];
  const heatIndex = Array.isArray(p?.heat_index_celsius) ? p.heat_index_celsius : [];
  const humidity = Array.isArray(p?.relative_humidity_percent) ? p.relative_humidity_percent : [];
  const count = Math.max(timestamps.length, apparent.length, heatIndex.length, humidity.length);
  return Array.from({ length: count }, (_, i) => ({
    timestamp: typeof timestamps[i] === 'string' ? timestamps[i] : null,
    // env_params does not return an hourly raw-air-temperature array in the documented schema.
    // The chart therefore uses hourly apparent temperature as the temperature series.
    temperature: round1(numberValue(apparent[i])),
    apparentTemperature: round1(numberValue(apparent[i])),
    heatIndex: round1(numberValue(heatIndex[i])),
    humidity: round1(numberValue(humidity[i])),
  })).filter((point) => point.timestamp && point.temperature !== null);
}

async function submitSatellite(c: Coordinates) {
  const dt = previousHour();
  const payload = await fg('/v1/satellite', {
    method: 'POST',
    body: JSON.stringify({
      sat: c,
      date_time: { start_date: dt.startDate, start_time: dt.startTime, filter_type: 1 },
      granularity: 80,
    }),
  });
  return { activityId: activityId(payload), dateTime: dt };
}

function toDataUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim();
  return v.startsWith('data:image/') ? v : `data:image/png;base64,${v}`;
}

function satelliteResult(result: any, id: string, c: Coordinates) {
  const segmentation = result?.segmentation ?? {};
  const original = result?.original_image ?? result?.orignal_image ?? null;
  const originalValue = Array.isArray(original) ? original.find((x) => typeof x === 'string') ?? null : original;
  return {
    activityId: id,
    coordinates: {
      latitude: Number(result?.coordinates?.latitude ?? c.latitude),
      longitude: Number(result?.coordinates?.longitude ?? c.longitude),
    },
    imageYear: numberValue(result?.image_year),
    originalImage: toDataUrl(originalValue),
    segmentedImage: toDataUrl(segmentation?.image_content ?? segmentation?.segmented_image),
    // Keep the raw names too for older frontend code.
    original_image: toDataUrl(originalValue),
    image_content: toDataUrl(segmentation?.image_content ?? segmentation?.segmented_image),
    segments: segmentation?.segments ?? {},
    imageLegend: segmentation?.image_legend ?? {},
    imageDimensions: segmentation?.image_dimensions ?? null,
    processingTimeSeconds: numberValue(segmentation?.processing_time_seconds),
    resultReceived: !!result,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const action = String(body?.action ?? '').trim().toLowerCase();

    if (action === 'health') {
      return json({ success: true, data: { fortyGuardApiKeyConfigured: !!Deno.env.get('FORTYGUARD_API_KEY'), timestamp: new Date().toISOString() } });
    }

    const c = { latitude: Number(body?.latitude), longitude: Number(body?.longitude) };
    if (action !== 'temperature-trend-status' && action !== 'current-temperature-status' && action !== 'satellite-segmentation-status') {
      if (!validCoordinates(c)) return json({ success: false, error: 'Valid latitude and longitude are required.' }, 400);
    }

    // CURRENT TEMPERATURE: each invocation performs only one upstream request.
    if (action === 'current-temperature-submit') {
      return json({ success: true, action, data: await submitHeatmap(c) });
    }
    if (action === 'current-temperature-status') {
      const id = String(body?.activityId ?? body?.activity_id ?? '').trim();
      if (!id) return json({ success: false, error: 'activityId is required.' }, 400);
      const state = await getStatus(id);
      if (isCompleted(state.status)) {
        const temperature = round1(extractHeatmapTemperature(state.result));
        return json({ success: true, action, data: { ...state, done: true, resultReceived: !!state.result, temperature, recordedAt: new Date().toISOString() } });
      }
      return json({ success: true, action, data: { ...state, done: false } });
    }

    // 12-HOUR TREND: one env_params activity, never 12 heatmaps.
    if (action === 'temperature-trend-submit' || action === 'temperature-trend') {
      const temperature = Number(body?.temperature);
      if (!Number.isFinite(temperature)) return json({ success: false, error: 'temperature is required for temperature-trend-submit.' }, 400);
      const hours = Number(body?.hours ?? 12);
      return json({ success: true, action: 'temperature-trend-submit', data: await submitTrend(c, temperature, hours) });
    }
    if (action === 'temperature-trend-status' || action === 'temperature-trend-result') {
      const id = String(body?.activityId ?? body?.environmentalActivityId ?? body?.environmental_activity_id ?? '').trim();
      if (!id) return json({ success: false, error: 'activityId is required.' }, 400);
      const state = await getStatus(id);
      if (isCompleted(state.status)) {
        const points = trendPoints(state.result);
        return json({ success: true, action: 'temperature-trend-status', data: { ...state, done: true, resultReceived: !!state.result, points, returnedHours: points.length, metadata: state.result?.metadata ?? null } });
      }
      return json({ success: true, action: 'temperature-trend-status', data: { ...state, done: false, points: [] } });
    }

    // SATELLITE: async split flow to avoid long-lived Edge Function polling.
    if (action === 'satellite-segmentation-submit') {
      return json({ success: true, action, data: await submitSatellite(c) });
    }
    if (action === 'satellite-segmentation-status') {
      const id = String(body?.activityId ?? body?.activity_id ?? '').trim();
      if (!id) return json({ success: false, error: 'activityId is required.' }, 400);
      const state = await getStatus(id);
      return json({ success: true, action, data: isCompleted(state.status) ? { ...state, done: true, ...satelliteResult(state.result, id, c) } : { ...state, done: false } });
    }

    return json({ success: false, error: 'Unknown action. Use current-temperature-submit, current-temperature-status, temperature-trend-submit, temperature-trend-status, satellite-segmentation-submit, satellite-segmentation-status, or health.' }, 400);
  } catch (error) {
    console.error('[FortyGuard proxy]', error);
    if (error instanceof FortyGuardHttpError) {
      return json({ success: false, error: 'FortyGuard API error', message: error.message, endpoint: error.endpoint, status: error.status, body: error.safeBody }, 502);
    }
    return json({ success: false, error: 'Edge Function internal error', message: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
