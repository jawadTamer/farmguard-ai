declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(
    handler: (req: Request) => Response | Promise<Response>
  ): void;
};

/**
 * Crop Heat-Risk ML Proxy
 *
 * Flow:
 * Angular
 *   ↓
 * Supabase Edge Function
 *   ↓
 * Crop Heat-Risk ML API
 *
 * IMPORTANT:
 * - Never call the ML API directly from Angular.
 * - Never return fake predictions.
 * - Fail fast when the ML server is unavailable.
 */

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const ML_API_URL = Deno.env.get('ML_API_URL');

if (!ML_API_URL) {
  console.error('[crop-heat-risk] ML_API_URL environment variable is not configured');
}

/**
 * Keep this short.
 *
 * The previous implementation waited 45 seconds.
 * That caused the Angular UI to appear stuck for a long time.
 *
 * 8 seconds gives the ML service enough time for a normal prediction while
 * keeping the UI responsive when the ML server is unreachable.
 */
const REQUEST_TIMEOUT_MS = 8_000;

const VALID_GROWTH_STAGES = [
  'maturity',
  'planted',
  'reproductive',
  'vegetative',
] as const;

type GrowthStage = typeof VALID_GROWTH_STAGES[number];

const VALID_RISK_CLASSES = [
  'Low',
  'Moderate',
  'High',
  'Critical',
] as const;

type RiskClass = typeof VALID_RISK_CLASSES[number];

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// CORS
// -----------------------------------------------------------------------------

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// -----------------------------------------------------------------------------
// Response helpers
// -----------------------------------------------------------------------------

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

// -----------------------------------------------------------------------------
// Validation helpers
// -----------------------------------------------------------------------------

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

function isValidNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value)
  );
}

function isValidProbability(value: unknown): value is number {
  return (
    isValidNumber(value) &&
    value >= 0 &&
    value <= 1
  );
}

// -----------------------------------------------------------------------------
// Request validation
// -----------------------------------------------------------------------------

function validateRequest(
  body: unknown
): {
  valid: boolean;
  error?: string;
} {
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
  ] as const;

  for (const field of numericFields) {
    if (!isValidNumber(req[field])) {
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

  // ---------------------------------------------------------------------------
  // Range validation
  // ---------------------------------------------------------------------------

  if (req.hour < 0 || req.hour > 23) {
    return {
      valid: false,
      error: 'hour must be between 0 and 23',
    };
  }

  if (
    req.day_of_year < 1 ||
    req.day_of_year > 366
  ) {
    return {
      valid: false,
      error: 'day_of_year must be between 1 and 366',
    };
  }

  if (
    req.month < 1 ||
    req.month > 12
  ) {
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

  if (
    req.latitude < -90 ||
    req.latitude > 90
  ) {
    return {
      valid: false,
      error:
        'latitude must be between -90 and 90',
    };
  }

  if (
    req.longitude < -180 ||
    req.longitude > 180
  ) {
    return {
      valid: false,
      error:
        'longitude must be between -180 and 180',
    };
  }

  if (req.days_since_planting < 0) {
    return {
      valid: false,
      error:
        'days_since_planting must be non-negative',
    };
  }

  // Environmental values should not be negative.
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

  return {
    valid: true,
  };
}

// -----------------------------------------------------------------------------
// ML response validation
// -----------------------------------------------------------------------------

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

  if (typeof response.status !== 'string') {
    return false;
  }

  if (response.predictions.length === 0) {
    return false;
  }

  for (const prediction of response.predictions) {
    if (
      !prediction ||
      typeof prediction !== 'object'
    ) {
      return false;
    }

    const item =
      prediction as Record<string, unknown>;

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

    const requiredProbabilityKeys = [
      'Critical',
      'High',
      'Low',
      'Moderate',
    ] as const;

    for (const key of requiredProbabilityKeys) {
      if (!isValidProbability(probabilities[key])) {
        return false;
      }
    }
  }

  return true;
}

// -----------------------------------------------------------------------------
// ML API call
// -----------------------------------------------------------------------------

async function callMLApi(
  request: CropHeatRiskRequest
): Promise<CropHeatRiskResponse> {
  if (!ML_API_URL) {
    throw new MLApiError(
      'CONFIGURATION_ERROR',
      'ML_API_URL is not configured'
    );
  }

  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  const startedAt = Date.now();

  try {
    console.log(
      '[crop-heat-risk] Calling ML API'
    );

    const response = await fetch(ML_API_URL, {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },

      body: JSON.stringify(request),

      signal: controller.signal,

      // Prevent stale/cached responses.
      cache: 'no-store',
    });

    const elapsedMs = Date.now() - startedAt;

    clearTimeout(timeoutId);

    console.log(
      `[crop-heat-risk] ML API responded in ${elapsedMs}ms with status ${response.status}`
    );

    // -------------------------------------------------------------------------
    // Non-2xx response
    // -------------------------------------------------------------------------

    if (!response.ok) {
      let errorText = '';

      try {
        errorText = await response.text();
      } catch {
        errorText = '';
      }

      console.error(
        `[crop-heat-risk] ML API HTTP ${response.status}`
      );

      throw new MLApiError(
        'ML_API_HTTP_ERROR',
        `ML API returned HTTP ${response.status}`,
        response.status,
        errorText.slice(0, 300)
      );
    }

    // -------------------------------------------------------------------------
    // Parse JSON
    // -------------------------------------------------------------------------

    let data: unknown;

    try {
      data = await response.json();
    } catch {
      throw new MLApiError(
        'ML_API_INVALID_JSON',
        'ML API returned an invalid JSON response'
      );
    }

    // -------------------------------------------------------------------------
    // Validate response structure
    // -------------------------------------------------------------------------

    if (!validateMLResponse(data)) {
      throw new MLApiError(
        'ML_API_INVALID_RESPONSE',
        'ML API returned an unexpected response format'
      );
    }

    return data;

  } catch (error) {
    clearTimeout(timeoutId);

    // -------------------------------------------------------------------------
    // Timeout
    // -------------------------------------------------------------------------

    if (
      error instanceof DOMException &&
      error.name === 'AbortError'
    ) {
      console.error(
        `[crop-heat-risk] ML API timeout after ${REQUEST_TIMEOUT_MS}ms`
      );

      throw new MLApiError(
        'ML_API_TIMEOUT',
        `ML API did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds`
      );
    }

    // Some runtimes may expose AbortError differently.
    if (
      error instanceof Error &&
      error.name === 'AbortError'
    ) {
      console.error(
        `[crop-heat-risk] ML API timeout after ${REQUEST_TIMEOUT_MS}ms`
      );

      throw new MLApiError(
        'ML_API_TIMEOUT',
        `ML API did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds`
      );
    }

    // -------------------------------------------------------------------------
    // Known ML error
    // -------------------------------------------------------------------------

    if (error instanceof MLApiError) {
      throw error;
    }

    // -------------------------------------------------------------------------
    // Network / fetch error
    // -------------------------------------------------------------------------

    if (error instanceof Error) {
      console.error(
        `[crop-heat-risk] ML API network error: ${error.message}`
      );

      throw new MLApiError(
        'ML_API_UNREACHABLE',
        'Unable to reach the ML API'
      );
    }

    throw new MLApiError(
      'ML_API_UNKNOWN_ERROR',
      'Unknown ML API error'
    );
  }
}

// -----------------------------------------------------------------------------
// Custom error
// -----------------------------------------------------------------------------

class MLApiError extends Error {
  code: string;
  httpStatus?: number;
  details?: string;

  constructor(
    code: string,
    message: string,
    httpStatus?: number,
    details?: string
  ) {
    super(message);

    this.name = 'MLApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

// -----------------------------------------------------------------------------
// Main Edge Function
// -----------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const requestStartedAt = Date.now();

  // ---------------------------------------------------------------------------
  // Configuration check
  // ---------------------------------------------------------------------------

  if (!ML_API_URL) {
    console.error('[crop-heat-risk] ML_API_URL environment variable is not configured');
    return jsonResponse(
      {
        success: false,
        error: 'CONFIGURATION_ERROR',
        message: 'Heat-risk prediction service is not configured.',
      },
      500
    );
  }

  // ---------------------------------------------------------------------------
  // CORS
  // ---------------------------------------------------------------------------

  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  // ---------------------------------------------------------------------------
  // Method
  // ---------------------------------------------------------------------------

  if (req.method !== 'POST') {
    return jsonResponse(
      {
        success: false,
        error: 'METHOD_NOT_ALLOWED',
        message: 'Only POST requests are supported',
      },
      405
    );
  }

  try {
    // -------------------------------------------------------------------------
    // Parse body
    // -------------------------------------------------------------------------

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_JSON',
          message: 'Request body must contain valid JSON',
        },
        400
      );
    }

    // -------------------------------------------------------------------------
    // Validate
    // -------------------------------------------------------------------------

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

    const mlRequest =
      body as CropHeatRiskRequest;

    console.log(
      '[crop-heat-risk] Valid request received'
    );

    // -------------------------------------------------------------------------
    // Call ML API
    // -------------------------------------------------------------------------

    const mlResponse =
      await callMLApi(mlRequest);

    // -------------------------------------------------------------------------
    // Success
    // -------------------------------------------------------------------------

    const totalElapsedMs =
      Date.now() - requestStartedAt;

    console.log(
      `[crop-heat-risk] Prediction successful in ${totalElapsedMs}ms`
    );

    return jsonResponse(
      {
        success: true,
        data: mlResponse,
      },
      200
    );

  } catch (error) {
    const totalElapsedMs =
      Date.now() - requestStartedAt;

    // -------------------------------------------------------------------------
    // ML API errors
    // -------------------------------------------------------------------------

    if (error instanceof MLApiError) {
      console.error(
        `[crop-heat-risk] ${error.code}: ${error.message}`
      );

      // Timeout gets 504 because the upstream service did not respond.
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

      // Upstream unavailable.
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

      // Invalid response from model.
      if (error.code === 'ML_API_INVALID_JSON') {
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

      if (error.code === 'ML_API_INVALID_RESPONSE') {
        return jsonResponse(
          {
            success: false,
            error: 'ML_API_INVALID_RESPONSE',
            message:
              'The crop heat-risk model returned an unexpected response.',
          },
          502
        );
      }

      // ML API returned an HTTP error.
      if (error.code === 'ML_API_HTTP_ERROR') {
        return jsonResponse(
          {
            success: false,
            error: 'ML_API_HTTP_ERROR',
            message:
              'The crop heat-risk model returned an error.',
          },
          502
        );
      }

      return jsonResponse(
        {
          success: false,
          error: 'ML_API_ERROR',
          message:
            'The crop heat-risk model could not complete the prediction.',
        },
        503
      );
    }

    // -------------------------------------------------------------------------
    // Unexpected server error
    // -------------------------------------------------------------------------

    console.error(
      '[crop-heat-risk] Unexpected error:',
      error
    );

    console.error(
      `[crop-heat-risk] Request failed after ${totalElapsedMs}ms`
    );

    return jsonResponse(
      {
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message:
          'Unable to process the crop heat-risk prediction.',
      },
      500
    );
  }
});