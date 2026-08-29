declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const ML_API_URL = 'http://51.121.62.104/predict';
const REQUEST_TIMEOUT_MS = 15_000;

const VALID_GROWTH_STAGES = ['maturity', 'planted', 'reproductive', 'vegetative'] as const;

type GrowthStage = typeof VALID_GROWTH_STAGES[number];

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
  heat_risk_class: 'Low' | 'Moderate' | 'High' | 'Critical';
  probabilities: HeatRiskProbabilities;
}

interface CropHeatRiskResponse {
  predictions: CropHeatRiskPrediction[];
  status: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function isValidGrowthStage(value: unknown): value is GrowthStage {
  return typeof value === 'string' && VALID_GROWTH_STAGES.includes(value as GrowthStage);
}

function isValidNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateRequest(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const req = body as Record<string, unknown>;

  // Validate required numeric fields
  const numericFields = [
    'hour', 'day_of_year', 'month', 'temperature_c', 
    'relative_humidity_percent', 'ghi_w_m2', 'dni_w_m2', 
    'dhi_w_m2', 'latitude', 'longitude', 'days_since_planting', 'heat_index_approx'
  ] as const;

  for (const field of numericFields) {
    if (!isValidNumber(req[field])) {
      return { valid: false, error: `${field} must be a valid number` };
    }
  }

  // Validate growth_stage
  if (!isValidGrowthStage(req.growth_stage)) {
    return { 
      valid: false, 
      error: `growth_stage must be one of: ${VALID_GROWTH_STAGES.join(', ')}` 
    };
  }

  // Validate location
  if (typeof req.location !== 'string' || !req.location.trim()) {
    return { valid: false, error: 'location is required' };
  }

  // Validate ranges
  if (req.hour < 0 || req.hour > 23) {
    return { valid: false, error: 'hour must be between 0 and 23' };
  }

  if (req.day_of_year < 1 || req.day_of_year > 366) {
    return { valid: false, error: 'day_of_year must be between 1 and 366' };
  }

  if (req.month < 1 || req.month > 12) {
    return { valid: false, error: 'month must be between 1 and 12' };
  }

  if (req.latitude < -90 || req.latitude > 90) {
    return { valid: false, error: 'latitude must be between -90 and 90' };
  }

  if (req.longitude < -180 || req.longitude > 180) {
    return { valid: false, error: 'longitude must be between -180 and 180' };
  }

  if (req.days_since_planting < 0) {
    return { valid: false, error: 'days_since_planting must be non-negative' };
  }

  return { valid: true };
}

async function callMLApi(request: CropHeatRiskRequest): Promise<CropHeatRiskResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(ML_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ML API returned ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await response.json() as CropHeatRiskResponse;
    return data;
  } catch (error) {
    clearTimeout(timeout);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('ML API request timed out');
    }
    
    if (error instanceof Error) {
      throw new Error(`ML API request failed: ${error.message}`);
    }
    
    throw new Error('Unknown ML API error');
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only POST method allowed
  if (req.method !== 'POST') {
    return jsonResponse(
      { success: false, error: 'Method not allowed' },
      405
    );
  }

  try {
    // Parse request body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        { success: false, error: 'Invalid JSON body' },
        400
      );
    }

    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      return jsonResponse(
        { success: false, error: validation.error },
        400
      );
    }

    const request = body as CropHeatRiskRequest;

    // Call ML API
    const mlResponse = await callMLApi(request);

    // Return successful response
    return jsonResponse({
      success: true,
      data: mlResponse,
    });

  } catch (error) {
    console.error('[crop-heat-risk]', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return jsonResponse(
      { 
        success: false, 
        error: 'Heat-risk prediction service unavailable',
        message: errorMessage 
      },
      503
    );
  }
});