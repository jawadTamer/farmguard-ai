declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(
    handler: (req: Request) => Response | Promise<Response>
  ): void;
};

const LIVESTOCK_ML_API_URL = Deno.env.get('LIVESTOCK_ML_API_URL');
const REQUEST_TIMEOUT_MS = 8_000;

const VALID_RISK_LEVELS = [
  'Low',
  'Moderate',
  'High',
  'Critical',
] as const;

type RiskLevel = typeof VALID_RISK_LEVELS[number];

interface LivestockHeatRiskRequest {
  species: string;
  breed?: string;
  sex: 'male' | 'female';
  physiological_stage?: string;
  age_years: number;
  weight_kg: number;
  latitude: number;
  longitude: number;
  temperature_c: number;
  humidity_percent: number;
}

interface LivestockHeatRiskProbabilities {
  Critical: number;
  High: number;
  Low: number;
  Moderate: number;
}

interface LivestockCalculatedFeatures {
  hli: number;
  thi: number;
}

interface LivestockHeatRiskPrediction {
  calculated_features: LivestockCalculatedFeatures;
  probabilities: LivestockHeatRiskProbabilities;
  risk_level: RiskLevel;
}

interface LivestockHeatRiskResponse {
  predictions: LivestockHeatRiskPrediction[];
  status: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(
  body: unknown,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidRiskLevel(
  value: unknown
): value is RiskLevel {
  return (
    typeof value === 'string' &&
    VALID_RISK_LEVELS.includes(value as RiskLevel)
  );
}

function validateRequest(
  body: unknown
): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') {
    return {
      valid: false,
      error: 'Invalid request body',
    };
  }

  const req = body as Record<string, unknown>;

  const requiredFields = [
    'species',
    'sex',
    'age_years',
    'weight_kg',
    'latitude',
    'longitude',
    'temperature_c',
    'humidity_percent',
  ];

  for (const field of requiredFields) {
    if (req[field] === undefined || req[field] === null) {
      return {
        valid: false,
        error: `${field} is required`,
      };
    }
  }

  if (typeof req.species !== 'string' || !req.species.trim()) {
    return {
      valid: false,
      error: 'species is required',
    };
  }

  if (req.sex !== 'male' && req.sex !== 'female') {
    return {
      valid: false,
      error: 'sex must be either male or female',
    };
  }

  if (!isFiniteNumber(req.age_years) || req.age_years < 0) {
    return {
      valid: false,
      error: 'age_years must be a non-negative number',
    };
  }

  if (!isFiniteNumber(req.weight_kg) || req.weight_kg < 0) {
    return {
      valid: false,
      error: 'weight_kg must be a non-negative number',
    };
  }

  if (!isFiniteNumber(req.latitude) || req.latitude < -90 || req.latitude > 90) {
    return {
      valid: false,
      error: 'latitude must be between -90 and 90',
    };
  }

  if (!isFiniteNumber(req.longitude) || req.longitude < -180 || req.longitude > 180) {
    return {
      valid: false,
      error: 'longitude must be between -180 and 180',
    };
  }

  if (!isFiniteNumber(req.temperature_c)) {
    return {
      valid: false,
      error: 'temperature_c must be a valid number',
    };
  }

  if (!isFiniteNumber(req.humidity_percent) || req.humidity_percent < 0 || req.humidity_percent > 100) {
    return {
      valid: false,
      error: 'humidity_percent must be between 0 and 100',
    };
  }

  return { valid: true };
}

function validateMLResponse(
  data: unknown
): data is LivestockHeatRiskResponse {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const response = data as Record<string, unknown>;

  if (!Array.isArray(response.predictions)) {
    return false;
  }

  if (response.predictions.length === 0) {
    return false;
  }

  if (typeof response.status !== 'string') {
    return false;
  }

  for (const prediction of response.predictions) {
    if (!prediction || typeof prediction !== 'object') {
      return false;
    }

    const item = prediction as Record<string, unknown>;

    if (!isValidRiskLevel(item.risk_level)) {
      return false;
    }

    if (
      !item.probabilities ||
      typeof item.probabilities !== 'object'
    ) {
      return false;
    }

    const probabilities =
      item.probabilities as Record<string, unknown>;

    for (const key of [
      'Critical',
      'High',
      'Low',
      'Moderate',
    ]) {
      const value = probabilities[key];

      if (
        !isFiniteNumber(value) ||
        value < 0 ||
        value > 1
      ) {
        return false;
      }
    }

    if (
      !item.calculated_features ||
      typeof item.calculated_features !== 'object'
    ) {
      return false;
    }

    const features = item.calculated_features as Record<string, unknown>;

    if (!isFiniteNumber(features.hli) || !isFiniteNumber(features.thi)) {
      return false;
    }
  }

  return true;
}

class MLApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly upstreamStatus?: number,
    public readonly upstreamBody?: string
  ) {
    super(message);
    this.name = 'MLApiError';
  }
}

async function callLivestockMLApi(
  payload: LivestockHeatRiskRequest
): Promise<LivestockHeatRiskResponse> {
  if (!LIVESTOCK_ML_API_URL) {
    throw new MLApiError(
      'CONFIGURATION_ERROR',
      'LIVESTOCK_ML_API_URL is not configured'
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const started = Date.now();

  try {
    console.log(`[livestock-heat-risk] POST ${LIVESTOCK_ML_API_URL}`);
    console.log('[livestock-heat-risk] Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(LIVESTOCK_ML_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store',
    });

    const elapsed = Date.now() - started;
    const responseText = await response.text();

    console.log(`[livestock-heat-risk] upstream_status=${response.status} elapsed_ms=${elapsed}`);
    console.log('[livestock-heat-risk] upstream_body:', responseText.slice(0, 1000));

    if (!response.ok) {
      throw new MLApiError(
        'ML_API_HTTP_ERROR',
        'The livestock heat-risk model returned an HTTP error.',
        response.status,
        responseText.slice(0, 1000)
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new MLApiError(
        'ML_API_INVALID_RESPONSE',
        'The livestock heat-risk model returned invalid JSON.'
      );
    }

    if (!validateMLResponse(data)) {
      throw new MLApiError(
        'ML_API_INVALID_RESPONSE',
        'The livestock heat-risk model returned an unexpected response format.'
      );
    }

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[livestock-heat-risk] timeout after ${REQUEST_TIMEOUT_MS}ms`);
      throw new MLApiError(
        'ML_API_TIMEOUT',
        'The livestock heat-risk model is taking too long to respond.'
      );
    }

    if (error instanceof MLApiError) {
      throw error;
    }

    console.error('[livestock-heat-risk] upstream unreachable:', error);
    throw new MLApiError(
      'ML_API_UNREACHABLE',
      'The livestock heat-risk model could not be reached.'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      {
        success: false,
        error: 'METHOD_NOT_ALLOWED',
        message: 'Only POST is supported.',
      },
      405
    );
  }

  if (!LIVESTOCK_ML_API_URL) {
    return jsonResponse(
      {
        success: false,
        error: 'CONFIGURATION_ERROR',
        message:
          'Livestock heat-risk prediction service is not configured.',
      },
      500
    );
  }

  try {
    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_JSON',
          message: 'Request body must be valid JSON.',
        },
        400
      );
    }

    const validation = validateRequest(body);

    if (!validation.valid) {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_REQUEST',
          message: validation.error,
        },
        400
      );
    }

    const result = await callLivestockMLApi(
      body as LivestockHeatRiskRequest
    );

    return jsonResponse({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(
      '[livestock-heat-risk] function error:',
      error
    );

    if (error instanceof MLApiError) {
      if (error.code === 'ML_API_TIMEOUT') {
        return jsonResponse(
          {
            success: false,
            error: 'ML_API_TIMEOUT',
            message:
              'The livestock heat-risk model is taking too long to respond. Please try again.',
          },
          504
        );
      }

      if (error.code === 'ML_API_UNREACHABLE') {
        return jsonResponse(
          {
            success: false,
            error: 'ML_API_UNREACHABLE',
            message:
              'The livestock heat-risk model is currently unreachable.',
          },
          503
        );
      }

      if (error.code === 'ML_API_HTTP_ERROR') {
        return jsonResponse(
          {
            success: false,
            error: 'ML_API_HTTP_ERROR',
            message:
              'The livestock heat-risk model returned an HTTP error.',
            upstream_status: error.upstreamStatus,
          },
          502
        );
      }

      if (error.code === 'ML_API_INVALID_RESPONSE') {
        return jsonResponse(
          {
            success: false,
            error: 'ML_API_INVALID_RESPONSE',
            message:
              'The livestock heat-risk model returned an invalid response.',
          },
          502
        );
      }

      if (error.code === 'CONFIGURATION_ERROR') {
        return jsonResponse(
          {
            success: false,
            error: 'CONFIGURATION_ERROR',
            message:
              'Livestock heat-risk prediction service is not configured.',
          },
          500
        );
      }
    }

    return jsonResponse(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message:
          'Unable to calculate livestock heat risk.',
      },
      500
    );
  }
});
