import { withSupabase } from 'npm:@supabase/server@^1';

const MODEL = 'gemini-3.6-flash';

const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const GEMINI_TIMEOUT_MS = 20_000;

const MAX_HISTORY = 10;
const MAX_TEMPERATURE_READINGS = 12;
const MAX_RISKS = 30;
const MAX_RECOMMENDATIONS = 15;
const MAX_ZONES = 50;
const MAX_CROPS = 100;
const MAX_LIVESTOCK = 100;

const SYSTEM_INSTRUCTION = `
You are FarmGuard AI Advisor, an agricultural decision-support assistant for farmers.

Your job is to help farmers understand their farm conditions and make practical decisions.

IMPORTANT:
You are NOT the risk prediction engine.

The supplied crop/livestock risk model is authoritative.

You MUST:
- Trust the supplied risk_level and risk_score.
- Never calculate a new risk score.
- Never override or contradict a supplied risk level.
- Never invent a risk assessment when one is missing.
- Explain what the existing risk means.
- Convert weather + farm data + risk model outputs into practical actions.

Never invent:
- crop information
- livestock information
- farm information
- weather values
- forecast values
- risk scores
- risk levels
- model predictions

Clearly distinguish:
- current observations
- forecasts
- historical observations

CROP CONSIDERATIONS:
- crop type
- variety
- growth stage
- planting date
- farm zone
- temperature
- heat index
- humidity
- wet-bulb temperature
- precipitation
- cloud cover
- risk model output

LIVESTOCK CONSIDERATIONS:
- animal type
- breed
- age group
- quantity
- farm zone
- temperature
- heat index
- humidity
- wet-bulb temperature
- risk model output

For heat stress, prioritize practical actions such as:
- water availability
- shade
- ventilation
- irrigation timing
- avoiding unnecessary animal handling during peak heat
- monitoring
- reducing avoidable heat exposure

For crops:
- consider irrigation timing based on available weather information
- avoid recommending spraying during unsuitable heat conditions
- explain why an action is recommended
- do not claim that irrigation or spraying guarantees crop protection

For livestock:
- prioritize water, shade, ventilation, and monitoring
- recommend veterinary assistance for serious illness or emergency symptoms

Do not diagnose diseases.
Do not guarantee outcomes.

If important information is missing:
- clearly state what is missing
- ask a focused follow-up question when appropriate

Answer in the farmer's language.
Be concise, clear, and practical.

Return ONLY valid JSON.

The JSON must have exactly these keys:

{
  "answer": "string",
  "urgency": "low|moderate|high|critical",
  "actions": ["string"],
  "needsMoreData": false
}

Do NOT include any additional keys.
Do NOT include markdown outside the JSON.
`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':
    'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: corsHeaders,
    },
  );
}

function cleanString(
  value: unknown,
): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function normalizeUrgency(
  value: unknown,
): 'low' | 'moderate' | 'high' | 'critical' {
  const urgency = String(value ?? '').toLowerCase();

  if (
    urgency === 'critical' ||
    urgency === 'high' ||
    urgency === 'moderate' ||
    urgency === 'low'
  ) {
    return urgency;
  }

  return 'low';
}

function normalizeActions(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item) =>
        typeof item === 'string',
    )
    .map(
      (item) =>
        item.trim(),
    )
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeGeminiAnswer(
  value: any,
) {
  return {
    answer: cleanString(
      value?.answer,
    ),

    urgency:
      normalizeUrgency(
        value?.urgency,
      ),

    actions:
      normalizeActions(
        value?.actions,
      ),

    needsMoreData:
      value?.needsMoreData === true,
  };
}

function hasRiskModelData(
  riskAssessments: any[],
): boolean {
  return (
    Array.isArray(riskAssessments) &&
    riskAssessments.some(
      (risk) =>
        risk &&
        (
          risk.risk_level !== null ||
          risk.risk_score !== null
        ),
    )
  );
}

/**
 * Resolve the authenticated Supabase user.
 *
 * Priority:
 *
 * 1. ctx.userClaims.sub
 *    Provided by @supabase/server when middleware
 *    successfully resolved the user.
 *
 * 2. Authorization Bearer token + supabase.auth.getUser()
 *    This verifies the JWT with Supabase instead of
 *    blindly decoding it.
 *
 * This is the important fix for:
 *
 * "Authenticated user not found"
 */
async function getAuthenticatedUserId(
  req: Request,
  ctx: any,
): Promise<string | null> {

  /*
   * First use the claims injected by withSupabase.
   */
  const claimsUserId =
    cleanString(
      ctx?.userClaims?.sub,
    );

  if (claimsUserId) {
    return claimsUserId;
  }

  /*
   * Fallback to the Authorization header.
   */
  const authorization =
    req.headers.get(
      'Authorization',
    ) ??
    req.headers.get(
      'authorization',
    );

  if (!authorization) {
    console.error(
      '[ai-advisor] Missing Authorization header',
    );

    return null;
  }

  if (
    !authorization
      .toLowerCase()
      .startsWith('bearer ')
  ) {
    console.error(
      '[ai-advisor] Invalid Authorization header format',
    );

    return null;
  }

  const accessToken =
    authorization
      .slice(7)
      .trim();

  if (!accessToken) {
    console.error(
      '[ai-advisor] Empty bearer token',
    );

    return null;
  }

  /*
   * IMPORTANT:
   *
   * Do NOT decode the JWT manually and trust the payload.
   *
   * Supabase auth.getUser(token) validates the token.
   */
  const supabase =
    ctx?.supabase;

  if (
    !supabase?.auth?.getUser
  ) {
    console.error(
      '[ai-advisor] Supabase auth client unavailable',
    );

    return null;
  }

  try {
    const result =
      await supabase.auth.getUser(
        accessToken,
      );

    if (result.error) {
      console.error(
        '[ai-advisor] JWT verification failed:',
        result.error.message,
      );

      return null;
    }

    const userId =
      cleanString(
        result.data?.user?.id,
      );

    if (!userId) {
      console.error(
        '[ai-advisor] JWT verified but user id is missing',
      );

      return null;
    }

    return userId;
  } catch (error) {
    console.error(
      '[ai-advisor] getUser failed:',
      error,
    );

    return null;
  }
}

async function callGemini(
  apiKey: string,
  prompt: string,
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      GEMINI_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        `${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',

          signal:
            controller.signal,

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text:
                    SYSTEM_INSTRUCTION,
                },
              ],
            },

            contents: [
              {
                role: 'user',

                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],

            generationConfig: {
              temperature: 0.15,

              maxOutputTokens:
                900,

              responseMimeType:
                'application/json',
            },
          }),
        },
      );

    const rawText =
      await response.text();

    let payload: any = null;

    try {
      payload =
        rawText
          ? JSON.parse(rawText)
          : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message =
        payload?.error?.message ||
        rawText.slice(0, 500) ||
        'Unknown Gemini API error';

      throw new Error(
        `Gemini API ${response.status}: ${message}`,
      );
    }

    const generated =
      payload
        ?.candidates?.[0]
        ?.content
        ?.parts
        ?.map(
          (part: any) =>
            part?.text ?? '',
        )
        .join('')
        .trim();

    if (!generated) {
      throw new Error(
        'Gemini returned an empty response',
      );
    }

    try {
      return JSON.parse(
        generated,
      );
    } catch {
      return {
        answer: generated,
        urgency: 'low',
        actions: [],
        needsMoreData: true,
      };
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'AbortError'
    ) {
      throw new Error(
        'Gemini request timed out',
      );
    }

    throw error;
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

async function loadFarm(
  supabase: any,
  farmId: string,
) {
  const query =
    await supabase
      .from('farms')
      .select(`
        id,
        name,
        description,
        latitude,
        longitude,
        area,
        area_unit,
        location,
        status
      `)
      .eq(
        'id',
        farmId,
      )
      .single();

  if (query.error) {
    throw new Error(
      `Farm lookup failed: ${query.error.message}`,
    );
  }

  if (!query.data) {
    throw new Error(
      'Farm not found',
    );
  }

  return query.data;
}

async function loadZones(
  supabase: any,
  farmId: string,
) {
  const query =
    await supabase
      .from('farm_zones')
      .select(`
        id,
        name,
        description,
        latitude,
        longitude,
        area
      `)
      .eq(
        'farm_id',
        farmId,
      )
      .limit(
        MAX_ZONES,
      );

  if (query.error) {
    throw new Error(
      `Zones lookup failed: ${query.error.message}`,
    );
  }

  return query.data ?? [];
}

async function loadCrops(
  supabase: any,
  zoneIds: string[],
) {
  if (!zoneIds.length) {
    return [];
  }

  const query =
    await supabase
      .from('crops')
      .select(`
        id,
        zone_id,
        crop_type,
        variety,
        growth_stage,
        planting_date
      `)
      .in(
        'zone_id',
        zoneIds,
      )
      .limit(
        MAX_CROPS,
      );

  if (query.error) {
    throw new Error(
      `Crops lookup failed: ${query.error.message}`,
    );
  }

  return query.data ?? [];
}

async function loadLivestock(
  supabase: any,
  zoneIds: string[],
) {
  if (!zoneIds.length) {
    return [];
  }

  const query =
    await supabase
      .from('livestock')
      .select(`
        id,
        zone_id,
        animal_type,
        breed,
        quantity,
        age_group
      `)
      .in(
        'zone_id',
        zoneIds,
      )
      .limit(
        MAX_LIVESTOCK,
      );

  if (query.error) {
    throw new Error(
      `Livestock lookup failed: ${query.error.message}`,
    );
  }

  return query.data ?? [];
}

async function loadWeather(
  supabase: any,
  farmId: string,
) {
  const query = await supabase
    .from('temperature_readings')
    .select(`
      temperature,
      humidity,
      heat_index,
      apparent_temperature,
      wet_bulb_temperature,
      recorded_at,
      forecast_for,
      source
    `)
    .eq('farm_id', farmId)
    .order('recorded_at', {
      ascending: false,
    })
    .limit(MAX_TEMPERATURE_READINGS);

  if (query.error) {
    throw new Error(
      `Weather lookup failed: ${query.error.message}`,
    );
  }

  return query.data ?? [];
}

async function loadRiskAssessments(
  supabase: any,
  farmId: string,
) {
  const query =
    await supabase
      .from('risk_assessments')
      .select(`
        id,
        zone_id,
        crop_id,
        livestock_id,
        risk_type,
        risk_level,
        risk_score,
        temperature,
        heat_index,
        reason,
        calculated_at,
        threshold_temperature,
        hours_above_threshold,
        persistence_hours,
        confidence,
        metadata
      `)
      .eq(
        'farm_id',
        farmId,
      )
      .order(
        'calculated_at',
        {
          ascending: false,
        },
      )
      .limit(
        MAX_RISKS,
      );

  if (query.error) {
    throw new Error(
      `Risk assessment lookup failed: ${query.error.message}`,
    );
  }

  return query.data ?? [];
}

async function loadRecommendations(
  supabase: any,
  farmId: string,
) {
  const query =
    await supabase
      .from('recommendations')
      .select(`
        id,
        zone_id,
        risk_assessment_id,
        category,
        title,
        description,
        priority,
        created_at
      `)
      .eq(
        'farm_id',
        farmId,
      )
      .order(
        'created_at',
        {
          ascending: false,
        },
      )
      .limit(
        MAX_RECOMMENDATIONS,
      );

  if (query.error) {
    throw new Error(
      `Recommendations lookup failed: ${query.error.message}`,
    );
  }

  return query.data ?? [];
}

async function loadFarmContext(
  supabase: any,
  farmId: string,
) {
  const farm =
    await loadFarm(
      supabase,
      farmId,
    );

  const zones =
    await loadZones(
      supabase,
      farmId,
    );

  const zoneIds =
    zones.map(
      (zone: any) =>
        zone.id,
    );

  const [
    crops,
    livestock,
    weather,
    riskAssessments,
    recommendations,
  ] = await Promise.all([
    loadCrops(
      supabase,
      zoneIds,
    ),

    loadLivestock(
      supabase,
      zoneIds,
    ),

    loadWeather(
      supabase,
      farmId,
    ),

    loadRiskAssessments(
      supabase,
      farmId,
    ),

    loadRecommendations(
      supabase,
      farmId,
    ),
  ]);

  return {
    farm,
    zones,
    crops,
    livestock,
    weather,
    riskAssessments,
    recommendations,
    currentTime:
      new Date().toISOString(),
  };
}

async function getOrCreateConversation(
  supabase: any,
  userId: string,
  farmId: string,
  question: string,
  conversationId: string | null,
) {
  /*
   * Existing conversation.
   *
   * Verify BOTH user_id and farm_id.
   */
  if (conversationId) {
    const existing =
      await supabase
        .from('advisor_conversations')
        .select('id')
        .eq(
          'id',
          conversationId,
        )
        .eq(
          'farm_id',
          farmId,
        )
        .eq(
          'user_id',
          userId,
        )
        .single();

    if (existing.error) {
      throw new Error(
        'Conversation not found for this farm',
      );
    }

    return String(
      existing.data.id,
    );
  }

  /*
   * Create a new conversation.
   */
  const created =
    await supabase
      .from('advisor_conversations')
      .insert({
        user_id:
          userId,

        farm_id:
          farmId,

        title:
          question.slice(
            0,
            80,
          ),
      })
      .select('id')
      .single();

  if (created.error) {
    throw new Error(
      `Conversation creation failed: ${created.error.message}`,
    );
  }

  return String(
    created.data.id,
  );
}

async function loadHistory(
  supabase: any,
  conversationId: string,
) {
  const query =
    await supabase
      .from('advisor_messages')
      .select(`
        role,
        content,
        created_at
      `)
      .eq(
        'conversation_id',
        conversationId,
      )
      .order(
        'created_at',
        {
          ascending: false,
        },
      )
      .limit(
        MAX_HISTORY,
      );

  if (query.error) {
    throw new Error(
      `Conversation history failed: ${query.error.message}`,
    );
  }

  return (
    query.data ?? []
  ).reverse();
}

function buildPrompt(
  context: any,
  history: any[],
  question: string,
) {
  const riskModelAvailable =
    hasRiskModelData(
      context.riskAssessments,
    );

  return `
FARM CONTEXT
============

The following information comes directly from FarmGuard's database.

Treat it as the source of truth.

${JSON.stringify(
  context,
  null,
  2,
)}

RISK MODEL STATUS
=================

Risk model data available:
${riskModelAvailable ? 'YES' : 'NO'}

IMPORTANT:

The riskAssessments array contains predictions generated by the FarmGuard risk model.

If a risk assessment exists:
- use its risk_level exactly
- use its risk_score exactly
- use its reason as supplied
- use its confidence when useful
- use threshold_temperature when useful
- use persistence information when useful

DO NOT calculate another risk score.
DO NOT change the model risk level.
DO NOT create a risk assessment if one does not exist.

If no relevant risk assessment exists, say that the risk model result is currently unavailable.

WEATHER
=======

Use only the supplied weather data.

Do not invent missing values.

Remember:
- null means unavailable
- missing data is NOT zero
- forecast data must not be described as current data
- historical data must not be described as current data

CONVERSATION HISTORY
====================

${JSON.stringify(
  history,
  null,
  2,
)}

FARMER QUESTION
===============

${question}

TASK
====

Answer the farmer.

If the question is about a specific crop:
- identify the crop
- identify its zone if possible
- find the relevant risk assessment
- explain the existing model result
- use the available weather
- provide practical actions

If the question is about livestock:
- identify the animal group
- identify its zone if possible
- find the relevant risk assessment
- explain the existing model result
- use the available weather
- provide practical actions

If the farmer asks about the whole farm:
- summarize the most important current risks
- prioritize critical/high risks
- give the most useful actions first

If required data is missing:
- clearly explain what is missing
- set needsMoreData to true when appropriate
- ask a focused question if necessary

Return ONLY the requested JSON.
`;
}

Deno.serve(
  withSupabase(
    {
      auth: 'user',
    },

    async (
      req: Request,
      ctx: any,
    ) => {

      /*
       * CORS
       */
      if (
        req.method ===
        'OPTIONS'
      ) {
        return new Response(
          'ok',
          {
            headers:
              corsHeaders,
          },
        );
      }

      /*
       * Only POST.
       */
      if (
        req.method !==
        'POST'
      ) {
        return jsonResponse(
          {
            success:
              false,

            error:
              'Method not allowed',
          },
          405,
        );
      }

      try {

        /*
         * GEMINI SECRET
         */
        const geminiApiKey =
          Deno.env.get(
            'GEMINI_API_KEY',
          );

        if (!geminiApiKey) {
          return jsonResponse(
            {
              success:
                false,

              error:
                'GEMINI_API_KEY is not configured in Supabase Edge Function secrets',
            },
            500,
          );
        }

        /*
         * REQUEST BODY
         */
        let body: any;

        try {
          body =
            await req.json();
        } catch {
          return jsonResponse(
            {
              success:
                false,

              error:
                'Invalid JSON body',
            },
            400,
          );
        }

        const farmId =
          cleanString(
            body?.farmId,
          );

        const question =
          cleanString(
            body?.message,
          );

        const conversationId =
          body?.conversationId
            ? cleanString(
                body.conversationId,
              )
            : null;

        /*
         * VALIDATION
         */
        if (!farmId) {
          return jsonResponse(
            {
              success:
                false,

              error:
                'farmId is required',
            },
            400,
          );
        }

        if (!question) {
          return jsonResponse(
            {
              success:
                false,

              error:
                'message is required',
            },
            400,
          );
        }

        if (
          question.length >
          4000
        ) {
          return jsonResponse(
            {
              success:
                false,

              error:
                'message is too long',
            },
            400,
          );
        }

        /*
         * AUTHENTICATION
         *
         * FIX:
         * Do not rely exclusively on
         * ctx.userClaims?.sub.
         */
        const userId =
          await getAuthenticatedUserId(
            req,
            ctx,
          );

        if (!userId) {
          return jsonResponse(
            {
              success:
                false,

              error:
                'Authentication required',

              message:
                'No valid authenticated Supabase user was found. Please refresh the session and try again.',
            },
            401,
          );
        }

        console.log(
          '[ai-advisor] Authenticated user:',
          userId,
        );

        const supabase =
          ctx.supabase;

        if (!supabase) {
          throw new Error(
            'Supabase client is unavailable',
          );
        }

        /*
         * FARM CONTEXT
         */
        const context =
          await loadFarmContext(
            supabase,
            farmId,
          );

        /*
         * CONVERSATION
         */
        const finalConversationId =
          await getOrCreateConversation(
            supabase,
            userId,
            farmId,
            question,
            conversationId,
          );

        /*
         * HISTORY BEFORE
         * inserting the new message.
         */
        const history =
          await loadHistory(
            supabase,
            finalConversationId,
          );

        /*
         * SAVE USER MESSAGE
         *
         * IMPORTANT:
         *
         * Current advisor_messages schema:
         *
         * id
         * conversation_id
         * role
         * content
         * created_at
         *
         * Therefore we ONLY insert:
         * conversation_id
         * role
         * content
         */
        const userMessage =
          await supabase
            .from(
              'advisor_messages',
            )
            .insert({
              conversation_id:
                finalConversationId,

              role:
                'user',

              content:
                question,
            });

        if (
          userMessage.error
        ) {
          throw new Error(
            `User message save failed: ${userMessage.error.message}`,
          );
        }

        /*
         * BUILD GEMINI PROMPT
         */
        const prompt =
          buildPrompt(
            context,
            history,
            question,
          );

        /*
         * CALL GEMINI
         */
        const rawAnswer =
          await callGemini(
            geminiApiKey,
            prompt,
          );

        /*
         * NORMALIZE GEMINI RESULT
         */
        const answer =
          normalizeGeminiAnswer(
            rawAnswer,
          );

        /*
         * Server-controlled risk model flag.
         *
         * Gemini cannot decide this.
         */
        const usedRiskModel =
          hasRiskModelData(
            context.riskAssessments,
          );

        /*
         * Prevent an empty assistant message.
         */
        if (!answer.answer) {
          throw new Error(
            'Gemini returned an empty answer',
          );
        }

        /*
         * SAVE ASSISTANT MESSAGE
         *
         * Again, compatible with the
         * current advisor_messages table.
         */
        const assistantMessage =
          await supabase
            .from(
              'advisor_messages',
            )
            .insert({
              conversation_id:
                finalConversationId,

              role:
                'assistant',

              content:
                answer.answer,
            });

        if (
          assistantMessage.error
        ) {
          throw new Error(
            `Assistant message save failed: ${assistantMessage.error.message}`,
          );
        }

        /*
         * FINAL RESPONSE
         */
        return jsonResponse({
          success:
            true,

          conversationId:
            finalConversationId,

          answer: {
            answer:
              answer.answer,

            urgency:
              answer.urgency,

            actions:
              answer.actions,

            usedRiskModel,

            needsMoreData:
              answer.needsMoreData,
          },
        });

      } catch (error) {

        console.error(
          '[ai-advisor]',
          error,
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              'AI Advisor failed',

            message:
              error instanceof Error
                ? error.message
                : 'Unknown error',
          },
          500,
        );
      }
    },
  ),
);