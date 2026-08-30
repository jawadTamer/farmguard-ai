declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(
    handler: (req: Request) => Response | Promise<Response>
  ): void;
};

const ML_API_URL = Deno.env.get('ML_API_URL');
const REQUEST_TIMEOUT_MS = 8_000;

const VALID_GROWTH_STAGES = [
  'maturity',
  'planted',
  'reproductive',
  'vegetative',
] as const;

const VALID_RISK_CLASSES = [
  'Low',
  'Moderate',
  'High',
  'Critical',
] as const;

type GrowthStage = typeof VALID_GROWTH_STAGES[number];
type RiskClass = typeof VALID_RISK_CLASSES[number];

interface CropHeatRiskRequest {
  hour: number;
  day_of_year: number;
  month: number;
  temperature_c: number;
  relative_humidity_percent: number;
  ghi_w_m2: number;
  dni_w_m2: number;
  dhi_w_m2: number;
  location: string;
  latitude: number;
  longitude: number;
  days_since_planting: number;
  growth_stage: GrowthStage;
  heat_index_approx: number;
}


interface HeatRiskProbabilities {
  Critical: number;
  High: number;
  Low: number;
  Moderate: number;
}

interface CropHeatRiskPrediction {
  heat_risk_class: RiskClass;
  probabilities: HeatRiskProbabilities;
}

interface CropHeatRiskResponse {
  predictions: CropHeatRiskPrediction[];
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

function isValidGrowthStage(
  value: unknown
): value is GrowthStage {
  return (
    typeof value === 'string' &&
    VALID_GROWTH_STAGES.includes(value as GrowthStage)
  );
}

function isValidRiskClass(
  value: unknown
): value is RiskClass {
  return (
    typeof value === 'string' &&
    VALID_RISK_CLASSES.includes(value as RiskClass)
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

  const numericFields = [
    'hour',
    'day_of_year',
    'month',
    'temperature_c',
    'relative_humidity_percent',
    'ghi_w_m2',
    'dni_w_m2',
    'dhi_w_m2',
    'latitude',
    'longitude',
    'days_since_planting',
    'heat_index_approx',
  ];

  for (const field of numericFields) {
    if (!isFiniteNumber(req[field])) {
      return {
        valid: false,
        error: `${field} must be a valid number`,
      };
    }
  }

  if (!isValidGrowthStage(req.growth_stage)) {
    return {
      valid: false,
      error:
        `growth_stage must be one of: ${VALID_GROWTH_STAGES.join(', ')}`,
    };
  }

  if (
    typeof req.location !== 'string' ||
    !req.location.trim()
  ) {
    return {
      valid: false,
      error: 'location is required',
    };
  }

  if (req.hour < 0 || req.hour > 23) {
    return {
      valid: false,
      error: 'hour must be between 0 and 23',
    };
  }

  if (req.day_of_year < 1 || req.day_of_year > 366) {
    return {
      valid: false,
      error: 'day_of_year must be between 1 and 366',
    };
  }

  if (req.month < 1 || req.month > 12) {
    return {
      valid: false,
      error: 'month must be between 1 and 12',
    };
  }

  if (
    req.relative_humidity_percent < 0 ||
    req.relative_humidity_percent > 100
  ) {
    return {
      valid: false,
      error:
        'relative_humidity_percent must be between 0 and 100',
    };
  }

  if (req.latitude < -90 || req.latitude > 90) {
    return {
      valid: false,
      error: 'latitude must be between -90 and 90',
    };
  }

  if (req.longitude < -180 || req.longitude > 180) {
    return {
      valid: false,
      error: 'longitude must be between -180 and 180',
    };
  }

  if (req.days_since_planting < 0) {
    return {
      valid: false,
      error:
        'days_since_planting must be non-negative',
    };
  }

  if (req.ghi_w_m2 < 0) {
    return {
      valid: false,
      error: 'ghi_w_m2 must be non-negative',
    };
  }

  if (req.dni_w_m2 < 0) {
    return {
      valid: false,
      error: 'dni_w_m2 must be non-negative',
    };
  }

  if (req.dhi_w_m2 < 0) {
    return {
      valid: false,
      error: 'dhi_w_m2 must be non-negative',
    };
  }

  return { valid: true };
}

function validateMLResponse(
  data: unknown
): data is CropHeatRiskResponse {
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

    if (!isValidRiskClass(item.heat_risk_class)) {
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

async function callMLApi(
  payload: CropHeatRiskRequest
): Promise<CropHeatRiskResponse> {
  if (!ML_API_URL) {
    throw new MLApiError(
      'CONFIGURATION_ERROR',
      'ML_API_URL is not configured'
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const started = Date.now();

  try {
    console.log(`[crop-heat-risk] POST ${ML_API_URL}`);
    console.log('[crop-heat-risk] Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(ML_API_URL, {
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

    console.log(`[crop-heat-risk] upstream_status=${response.status} elapsed_ms=${elapsed}`);
    console.log('[crop-heat-risk] upstream_body:', responseText.slice(0, 1000));

    if (!response.ok) {
      throw new MLApiError(
        'ML_API_HTTP_ERROR',
        'The crop heat-risk model returned an HTTP error.',
        response.status,
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new MLApiError(
        'ML_API_INVALID_RESPONSE',
        'The crop heat-risk model returned invalid JSON.'
      );
    }

    if (!validateMLResponse(data)) {
      throw new MLApiError(
        'ML_API_INVALID_RESPONSE',
        'The crop heat-risk model returned an unexpected response format.'
      );
    }

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[crop-heat-risk] timeout after ${REQUEST_TIMEOUT_MS}ms`);
      throw new MLApiError(
        'ML_API_TIMEOUT',
        'The crop heat-risk model is taking too long to respond.'
      );
    }

    if (error instanceof MLApiError) {
      throw error;
    }

    console.error('[crop-heat-risk] upstream unreachable:', error);
    throw new MLApiError(
      'ML_API_UNREACHABLE',
      'The crop heat-risk model could not be reached.'
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

  if (!ML_API_URL) {
    return jsonResponse(
      {
        success: false,
        error: 'CONFIGURATION_ERROR',
        message:
          'Heat-risk prediction service is not configured.',
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

    const result = await callMLApi(
      body as CropHeatRiskRequest
    );

    return jsonResponse({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(
      '[crop-heat-risk] function error:',
      error
    );

    if (error instanceof MLApiError) {
      if (error.code === 'ML_API_TIMEOUT') {
        return jsonResponse(
          {
            success: false,
            error: 'ML_API_TIMEOUT',
            message:
              'The crop heat-risk model is taking too long to respond. Please try again.',
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
              'The crop heat-risk model is currently unreachable.',
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
              'The crop heat-risk model returned an HTTP error.',
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
              'The crop heat-risk model returned an invalid response.',
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
              'Heat-risk prediction service is not configured.',
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
          'Unable to calculate crop heat risk.',
      },
      500
    );
  }
});