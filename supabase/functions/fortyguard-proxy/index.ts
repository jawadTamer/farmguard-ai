declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };

  serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void;
};

/* ============================================================
   CONFIG
============================================================ */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BASE_URL = 'https://api.fortyguard.com';

const MAX_POLLS = 60;
const POLL_DELAY_MS = 1500;
const REQUEST_TIMEOUT_MS = 30000;

/* ============================================================
   TYPES
============================================================ */

type Coordinates = {
  latitude: number;
  longitude: number;
};

type DateTime = {
  startDate: string;
  startTime: string;
};

type DateRange = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

type TemperatureExtraction = {
  temperature: number | null;
  source: string | null;
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

/* ============================================================
   RESPONSES
============================================================ */

function jsonResponse(
  body: unknown,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type':
          'application/json',
      },
    },
  );
}

/* ============================================================
   DATE / TIME
============================================================ */

/*
  FortyGuard says data can be requested
  up to 12 hours past current time.

  We use the previous completed UTC hour
  for the base heatmap request.
*/

function getUtcDateTime(): DateTime {
  const date = new Date(
    Date.now() - 60 * 60 * 1000,
  );

  date.setUTCMinutes(
    0,
    0,
    0,
  );

  return {
    startDate:
      date
        .toISOString()
        .slice(0, 10),

    startTime:
      date
        .toISOString()
        .slice(11, 16),
  };
}

/*
  Build a range for the temperature trend.

  Example:

  Start:
  2026-08-23 10:00

  End:
  2026-08-23 21:00

  If it crosses midnight:

  Start:
  2026-08-23 20:00

  End:
  2026-08-24 07:00
*/

function getUtcDateRange(
  hours = 12,
): DateRange {
  const start = new Date(
    Date.now() -
      60 * 60 * 1000,
  );

  start.setUTCMinutes(
    0,
    0,
    0,
  );

  /*
    12 points including the starting hour.

    Example:
    10,11,12,13,14,15,16,17,18,19,20,21
  */

  const end = new Date(
    start.getTime() +
      (hours - 1) *
        60 *
        60 *
        1000,
  );

  return {
    startDate:
      start
        .toISOString()
        .slice(0, 10),

    startTime:
      start
        .toISOString()
        .slice(11, 16),

    endDate:
      end
        .toISOString()
        .slice(0, 10),

    endTime:
      end
        .toISOString()
        .slice(11, 16),
  };
}

/* ============================================================
   POLYGON
============================================================ */

function buildPolygon({
  latitude,
  longitude,
}: Coordinates) {
  const delta = 0.005;

  return {
    type: 'FeatureCollection',

    features: [
      {
        type: 'Feature',

        properties: {},

        geometry: {
          type: 'Polygon',

          coordinates: [
            [
              [
                longitude - delta,
                latitude - delta,
              ],

              [
                longitude + delta,
                latitude - delta,
              ],

              [
                longitude + delta,
                latitude + delta,
              ],

              [
                longitude - delta,
                latitude + delta,
              ],

              [
                longitude - delta,
                latitude - delta,
              ],
            ],
          ],
        },
      },
    ],
  };
}

/* ============================================================
   HTTP
============================================================ */

async function fg(
  path: string,
  init: RequestInit = {},
) {
  const apiKey =
    Deno.env.get(
      'FORTYGUARD_API_KEY',
    );

  if (!apiKey) {
    throw new Error(
      'FORTYGUARD_API_KEY is not configured in Supabase Edge Function secrets.',
    );
  }

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      REQUEST_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        `${BASE_URL}${path}`,
        {
          ...init,

          signal:
            controller.signal,

          headers: {
            'api-key':
              apiKey,

            Accept:
              'application/json',

            ...(
              init.method === 'GET'
                ? {}
                : {
                    'Content-Type':
                      'application/json',
                  }
            ),

            ...(
              init.headers ?? {}
            ),
          },
        },
      );

    const text =
      await response.text();

    let payload: any;

    try {
      payload =
        text
          ? JSON.parse(text)
          : null;
    } catch {
      payload = {
        raw: text,
      };
    }

    if (
      !response.ok ||
      payload?.error === true ||
      payload?.error === 'true'
    ) {
      throw new FortyGuardHttpError(
        response.status,
        path,

        String(
          payload?.message ??
          payload?.error ??
          response.statusText ??
          'FortyGuard request failed',
        ),

        text.length > 2000
          ? `${text.slice(0, 2000)}...`
          : text,
      );
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

/* ============================================================
   WAIT FOR ACTIVITY
============================================================ */

async function waitForActivity(
  activityId: string,
) {
  let lastStatus =
    'unknown';

  for (
    let attempt = 1;
    attempt <= MAX_POLLS;
    attempt++
  ) {
    try {
      const payload =
        await fg(
          `/v1/status/${activityId}`,
          {
            method: 'GET',
          },
        );

      const data =
        payload?.data ??
        payload ??
        {};

      const status =
        String(
          data?.status ??
          payload?.status ??
          '',
        )
          .toLowerCase()
          .trim();

      lastStatus =
        status ||
        'unknown';

      console.log(
        '[FortyGuard] STATUS',
        JSON.stringify({
          activityId,
          attempt,
          status:
            lastStatus,
        }),
      );

      if (
        [
          'completed',
          'succeeded',
          'success',
        ].includes(status)
      ) {
        return {
          result:
            data?.result ??
            payload?.result ??
            null,

          raw:
            payload,
        };
      }

      if (
        [
          'failed',
          'error',
        ].includes(status)
      ) {
        throw new Error(
          data?.message ??
          payload?.message ??
          `FortyGuard activity failed with status ${status}.`,
        );
      }
    } catch (
      error
    ) {
      if (
        !(
          error instanceof
          FortyGuardHttpError
        ) ||
        error.status !== 404
      ) {
        throw error;
      }
    }

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          POLL_DELAY_MS,
        ),
    );
  }

  throw new Error(
    `FortyGuard activity ${activityId} timed out. Last status: ${lastStatus}.`,
  );
}

/* ============================================================
   NUMERIC HELPERS
============================================================ */

function num(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    Array.isArray(value)
  ) {
    for (
      const item of value
    ) {
      const result =
        num(item);

      if (
        result !== null
      ) {
        return result;
      }
    }

    return null;
  }

  if (
    typeof value ===
    'object'
  ) {
    const object =
      value as Record<
        string,
        unknown
      >;

    for (
      const key of [
        'value',
        'Value',
        'mean',
        'Mean',
        'average',
        'Average',
        'temperature',
        'Temperature',
      ]
    ) {
      const result =
        num(
          object[key],
        );

      if (
        result !== null
      ) {
        return result;
      }
    }

    return null;
  }

  const number =
    Number(value);

  /*
    FortyGuard legacy missing value.
  */

  if (
    number === -999
  ) {
    return null;
  }

  return Number.isFinite(number)
    ? number
    : null;
}

function numericArray(
  value: unknown,
): Array<number | null> {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  return value.map(
    (item) =>
      num(item),
  );
}

function mean(
  values: number[],
): number | null {
  if (
    !values.length
  ) {
    return null;
  }

  return (
    values.reduce(
      (
        sum,
        value,
      ) =>
        sum + value,
      0,
    ) /
    values.length
  );
}

/* ============================================================
   HEATMAP TEMPERATURE EXTRACTION
============================================================ */

function extract(
  result: any,
): TemperatureExtraction {
  const stats =
    result?.stats_data ??
    result?.statsData ??
    {};

  const temperatureStats =
    stats?.Temperature_stats ??
    stats?.temperature_stats ??
    stats?.temperatureStats ??
    {};

  const candidates:
    Array<
      [
        string,
        unknown
      ]
    > = [
      [
        'stats_data.Temperature_stats.Mean',
        temperatureStats?.Mean,
      ],

      [
        'stats_data.Temperature_stats.mean',
        temperatureStats?.mean,
      ],

      [
        'stats_data.Temperature_stats.Average',
        temperatureStats?.Average,
      ],

      [
        'stats_data.mean_temperature',
        stats?.mean_temperature,
      ],

      [
        'stats_data.average_temperature',
        stats?.average_temperature,
      ],

      [
        'result.temperature',
        result?.temperature,
      ],
    ];

  for (
    const [
      source,
      value,
    ] of candidates
  ) {
    const temperature =
      num(value);

    if (
      temperature !== null
    ) {
      return {
        temperature,
        source,
      };
    }
  }

  const distribution =
    stats?.Overall_temperature_distribution ??
    stats?.overall_temperature_distribution ??
    stats?.temperature_distribution ??
    result?.temperature_distribution;

  if (
    Array.isArray(
      distribution,
    )
  ) {
    const values =
      distribution
        .map(num)
        .filter(
          (
            value,
          ): value is number =>
            value !== null,
        );

    const temperature =
      mean(values);

    if (
      temperature !== null
    ) {
      return {
        temperature,

        source:
          'temperature_distribution.mean',
      };
    }
  }

  const features =
    Array.isArray(
      result?.map_data
        ?.features,
    )
      ? result.map_data
          .features
      : [];

  const temperatures:
    number[] = [];

  for (
    const feature of features
  ) {
    const properties =
      feature?.properties ??
      {};

    const temperature =
      num(
        properties
          ?.average_temperature ??
        properties
          ?.avg_temperature ??
        properties
          ?.mean_temperature ??
        properties
          ?.temperature ??
        properties
          ?.Temperature ??
        properties
          ?.temp,
      );

    if (
      temperature !== null
    ) {
      temperatures.push(
        temperature,
      );
    }
  }

  const featureMean =
    mean(
      temperatures,
    );

  return {
    temperature:
      featureMean,

    source:
      featureMean !== null
        ? 'map_data.features.mean'
        : null,
  };
}

/* ============================================================
   HEATMAP
============================================================ */

async function heatmap(
  coordinates: Coordinates,
) {
  const dateTime =
    getUtcDateTime();

  const submitted =
    await fg(
      '/v1/heatmap',
      {
        method: 'POST',

        body:
          JSON.stringify({
            polygon_aoi:
              buildPolygon(
                coordinates,
              ),

            date_time: {
              start_date:
                dateTime.startDate,

              start_time:
                dateTime.startTime,

              filter_type:
                1,
            },

            granularity:
              100,

            analytic_type:
              'tcm',
          }),
      },
    );

  const activityId =
    submitted?.data
      ?.activity_id ??
    submitted
      ?.activity_id;

  if (!activityId) {
    throw new Error(
      'FortyGuard heatmap submission returned no activity_id.',
    );
  }

  const completed =
    await waitForActivity(
      activityId,
    );

  const result =
    completed.result;

  const extraction =
    extract(result);

  const stats =
    result?.stats_data ??
    result?.statsData ??
    {};

  const features =
    Array.isArray(
      result?.map_data
        ?.features,
    )
      ? result.map_data
          .features
      : [];

  return {
    temperature:
      extraction.temperature,

    temperatureSource:
      extraction.source,

    activityId,

    dateTime,

    recordedAt:
      new Date()
        .toISOString(),

    diagnostics: {
      resultReceived:
        !!result,

      resultKeys:
        Object.keys(
          result ?? {},
        ),

      statsKeys:
        Object.keys(
          stats ?? {},
        ),

      nCells:
        Number(
          stats?.n_cells ??
          stats?.nCells ??
          0,
        ),

      featuresCount:
        features.length,
    },
  };
}

/* ============================================================
   ENVIRONMENTAL SINGLE HOUR
============================================================ */

async function env(
  coordinates: Coordinates,
  temperature: number,
  dateTime: DateTime,
) {
  const submitted =
    await fg(
      '/v1/env_params',
      {
        method: 'POST',

        body:
          JSON.stringify({
            latitude:
              coordinates.latitude,

            longitude:
              coordinates.longitude,

            temperature,

            date_time: {
              start_date:
                dateTime.startDate,

              start_time:
                dateTime.startTime,

              filter_type:
                1,
            },
          }),
      },
    );

  const activityId =
    submitted?.data
      ?.activity_id ??
    submitted
      ?.activity_id;

  if (!activityId) {
    throw new Error(
      'FortyGuard environmental submission returned no activity_id.',
    );
  }

  const completed =
    await waitForActivity(
      activityId,
    );

  const result =
    completed.result;

  const location =
    result?.locations?.[0] ??
    {};

  const parameters =
    location?.parameters ??
    {};

  return {
    activityId,

    resultReceived:
      !!result,

    temperature:
      num(
        location.temperature,
      ) ??
      temperature,

    heatIndex:
      num(
        parameters
          .heat_index_celsius,
      ),

    apparentTemperature:
      num(
        parameters
          .apparent_temperature_celsius,
      ),

    humidity:
      num(
        parameters
          .relative_humidity_percent,
      ),

    precipitation:
      num(
        parameters
          .precipitation_mm,
      ),

    wetBulbTemperature:
      num(
        parameters
          .wet_bulb_temperature_celsius,
      ),

    cloudCover:
      num(
        parameters
          .cloud_cover_octas ??
        parameters
          .cloud_cover_metric,
      ),

    aqi:
      num(
        parameters[
          'air_quality:idx'
        ] ??
        parameters.aqi_us,
      ),

    solarIrradiance:
      location
        .solar_irradiance ??
      null,

    metadata:
      result?.metadata ??
      null,
  };
}

/* ============================================================
   12 HOUR TEMPERATURE TREND
============================================================ */

/*
  This uses:

  POST /v1/env_params

  filter_type: 2

  The returned parameter arrays are aligned
  with metadata.timestamps.
*/

async function temperatureTrend(
  coordinates: Coordinates,
  temperature: number,
  hours = 12,
) {
  const safeHours =
    Math.min(
      Math.max(
        Math.floor(hours),
        2,
      ),
      24,
    );

  const dateRange =
    getUtcDateRange(
      safeHours,
    );

  const submitted =
    await fg(
      '/v1/env_params',
      {
        method: 'POST',

        body:
          JSON.stringify({
            latitude:
              coordinates.latitude,

            longitude:
              coordinates.longitude,

            /*
              Required by FortyGuard.
              This is the latest valid
              temperature obtained from heatmap.
            */

            temperature,

            date_time: {
              start_date:
                dateRange.startDate,

              start_time:
                dateRange.startTime,

              end_date:
                dateRange.endDate,

              end_time:
                dateRange.endTime,

              filter_type:
                2,
            },

            /*
              Request only the fields
              useful for the chart.

              Remove analysis completely
              if your FortyGuard plan
              should return all parameters.
            */

            analysis: [
              'apparent_temperature_celsius',
              'heat_index_celsius',
              'wet_bulb_temperature_celsius',
            ],
          }),
      },
    );

  const activityId =
    submitted?.data
      ?.activity_id ??
    submitted
      ?.activity_id;

  if (!activityId) {
    throw new Error(
      'FortyGuard temperature trend submission returned no activity_id.',
    );
  }

  console.log(
    '[FortyGuard] TREND SUBMITTED',
    JSON.stringify({
      activityId,
      dateRange,
      safeHours,
    }),
  );

  const completed =
    await waitForActivity(
      activityId,
    );

  const result =
    completed.result;

  const metadata =
    result?.metadata ??
    {};

  const location =
    result?.locations?.[0] ??
    {};

  const parameters =
    location?.parameters ??
    {};

  const timestamps:
    string[] =
    Array.isArray(
      metadata.timestamps,
    )
      ? metadata.timestamps
      : [];

  /*
    env_params does not document
    temperature as a time-aligned array.

    The arrays that ARE guaranteed
    time-aligned are inside parameters.

    For the dashboard chart we use
    apparent_temperature_celsius
    as the primary trend when available.

    heat_index and wet_bulb are also returned.
  */

  const apparent =
    numericArray(
      parameters
        .apparent_temperature_celsius,
    );

  const heatIndex =
    numericArray(
      parameters
        .heat_index_celsius,
    );

  const wetBulb =
    numericArray(
      parameters
        .wet_bulb_temperature_celsius,
    );

  const points =
    timestamps.map(
      (
        timestamp,
        index,
      ) => {
        /*
          Primary displayed temperature.

          Prefer apparent temperature.

          If unavailable, use heat index,
          then wet bulb.

          IMPORTANT:
          null is preserved.
          Missing API values are NEVER
          converted to zero.
        */

        const displayTemperature =
          apparent[index] ??
          heatIndex[index] ??
          wetBulb[index] ??
          null;

        return {
          timestamp,

          temperature:
            displayTemperature,

          apparentTemperature:
            apparent[index] ??
            null,

          heatIndex:
            heatIndex[index] ??
            null,

          wetBulbTemperature:
            wetBulb[index] ??
            null,
        };
      },
    );

  console.log(
    '[FortyGuard] TREND COMPLETE',
    JSON.stringify({
      activityId,

      timestampCount:
        timestamps.length,

      apparentCount:
        apparent.length,

      heatIndexCount:
        heatIndex.length,

      wetBulbCount:
        wetBulb.length,
    }),
  );

  return {
    activityId,

    resultReceived:
      !!result,

    coordinates: {
      latitude:
        Number(
          location?.lat ??
          coordinates.latitude,
        ),

      longitude:
        Number(
          location?.lon ??
          coordinates.longitude,
        ),
    },

    requestedTemperature:
      temperature,

    dateRange,

    metadata,

    points,

    /*
      Raw arrays are useful
      for the Angular frontend.
    */

    timestamps,

    apparentTemperature:
      apparent,

    heatIndex,

    wetBulbTemperature:
      wetBulb,
  };
}

/* ============================================================
   IMAGE HELPER
============================================================ */

function toDataUrl(
  value: unknown,
) {
  if (
    typeof value !==
      'string' ||
    !value.trim()
  ) {
    return null;
  }

  const image =
    value.trim();

  return image.startsWith(
    'data:image/',
  )
    ? image
    : `data:image/png;base64,${image}`;
}

/* ============================================================
   SATELLITE
============================================================ */

async function satellite(
  coordinates: Coordinates,
) {
  const dateTime =
    getUtcDateTime();

  const submitted =
    await fg(
      '/v1/satellite',
      {
        method: 'POST',

        body:
          JSON.stringify({
            sat: {
              latitude:
                coordinates.latitude,

              longitude:
                coordinates.longitude,
            },

            date_time: {
              start_date:
                dateTime.startDate,

              start_time:
                dateTime.startTime,

              filter_type:
                1,
            },

            granularity:
              80,
          }),
      },
    );

  const activityId =
    submitted?.data
      ?.activity_id ??
    submitted
      ?.activity_id;

  if (!activityId) {
    throw new Error(
      'FortyGuard satellite submission returned no activity_id.',
    );
  }

  const completed =
    await waitForActivity(
      activityId,
    );

  const result =
    completed.result;

  const segmentation =
    result?.segmentation ??
    {};

  const original =
    result?.orignal_image ??
    result?.original_image ??
    [];

  const originalValue =
    Array.isArray(
      original,
    )
      ? (
          original.find(
            (item: unknown) =>
              typeof item ===
                'string' &&
              item.trim(),
          ) ?? null
        )
      : original;

  return {
    activityId,

    dateTime,

    coordinates: {
      latitude:
        Number(
          result?.coordinates
            ?.latitude ??
          coordinates.latitude,
        ),

      longitude:
        Number(
          result?.coordinates
            ?.longitude ??
          coordinates.longitude,
        ),
    },

    imageYear:
      num(
        result?.image_year,
      ),

    originalImage:
      toDataUrl(
        originalValue,
      ),

    segmentedImage:
      toDataUrl(
        segmentation
          ?.image_content ??
        segmentation
          ?.segmented_image,
      ),

    segments:
      segmentation
        ?.segments ??
      {},

    imageLegend:
      segmentation
        ?.image_legend ??
      {},

    imageDimensions:
      segmentation
        ?.image_dimensions ??
      null,

    processingTimeSeconds:
      num(
        segmentation
          ?.processing_time_seconds,
      ),

    mode:
      segmentation?.mode ??
      'sat',

    resultReceived:
      !!result,
  };
}

/* ============================================================
   SERVER
============================================================ */

Deno.serve(
  async (
    req: Request,
  ) => {
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

    if (
      req.method !==
      'POST'
    ) {
      return jsonResponse(
        {
          success: false,

          error:
            'Method not allowed',
        },
        405,
      );
    }

    try {
      const body =
        await req.json();

      const action =
        body?.action;

      /* --------------------------------------------------------
         HEALTH
      -------------------------------------------------------- */

      if (
        action ===
        'health'
      ) {
        return jsonResponse({
          success: true,

          data: {
            fortyGuardApiKeyConfigured:
              !!Deno.env.get(
                'FORTYGUARD_API_KEY',
              ),

            timestamp:
              new Date()
                .toISOString(),
          },
        });
      }

      const latitude =
        Number(
          body?.latitude,
        );

      const longitude =
        Number(
          body?.longitude,
        );

      if (
        !Number.isFinite(
          latitude,
        ) ||
        !Number.isFinite(
          longitude,
        ) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return jsonResponse(
          {
            success: false,

            error:
              'Valid latitude and longitude are required.',
          },
          400,
        );
      }

      const coordinates: Coordinates = {
        latitude,
        longitude,
      };

      /* --------------------------------------------------------
         CURRENT TEMPERATURE
      -------------------------------------------------------- */

      if (
        action ===
        'current-temperature'
      ) {
        const heatmapResult =
          await heatmap(
            coordinates,
          );

        let environmental:
          | Awaited<
              ReturnType<
                typeof env
              >
            >
          | null =
            null;

        let environmentalError:
          | string
          | null =
            null;

        if (
          heatmapResult.temperature !==
          null
        ) {
          try {
            environmental =
              await env(
                coordinates,

                heatmapResult
                  .temperature,

                heatmapResult
                  .dateTime,
              );
          } catch (
            error
          ) {
            environmentalError =
              error instanceof Error
                ? error.message
                : 'Environmental parameters failed.';
          }
        } else {
          environmentalError =
            'Heatmap completed but no temperature value was available for env_params.';
        }

        /*
          IMPORTANT:

          diagnostics does NOT contain
          resultReceived or temperatureSource.

          Therefore no duplicate-property
          TypeScript warnings.
        */

        return jsonResponse({
          success: true,

          action,

          data: {
            ...heatmapResult
              .diagnostics,

            resultReceived:
              true,

            temperature:
              environmental
                ?.temperature ??
              heatmapResult
                .temperature,

            temperatureSource:
              heatmapResult
                .temperatureSource,

            feelsLike:
              environmental
                ?.apparentTemperature ??
              null,

            humidity:
              environmental
                ?.humidity ??
              null,

            heatIndex:
              environmental
                ?.heatIndex ??
              null,

            wetBulbTemperature:
              environmental
                ?.wetBulbTemperature ??
              null,

            precipitation:
              environmental
                ?.precipitation ??
              null,

            cloudCover:
              environmental
                ?.cloudCover ??
              null,

            aqi:
              environmental
                ?.aqi ??
              null,

            solarIrradiance:
              environmental
                ?.solarIrradiance ??
              null,

            recordedAt:
              heatmapResult
                .recordedAt,

            coordinates,

            heatmapActivityId:
              heatmapResult
                .activityId,

            environmentalActivityId:
              environmental
                ?.activityId ??
              null,

            environmentalResultReceived:
              environmental
                ?.resultReceived ??
              false,

            environmentalError,
          },
        });
      }

      /* --------------------------------------------------------
         ENVIRONMENTAL PARAMETERS
      -------------------------------------------------------- */

      if (
        action ===
        'environmental-parameters'
      ) {
        const temperature =
          Number(
            body?.temperature,
          );

        if (
          !Number.isFinite(
            temperature,
          )
        ) {
          return jsonResponse(
            {
              success: false,

              error:
                'temperature is required for environmental-parameters.',
            },
            400,
          );
        }

        const data =
          await env(
            coordinates,
            temperature,
            getUtcDateTime(),
          );

        return jsonResponse({
          success: true,

          action,

          data,
        });
      }

      /* --------------------------------------------------------
         12 HOUR TEMPERATURE TREND

         First get a valid temperature
         from the heatmap.

         Then use that temperature with
         /v1/env_params filter_type = 2.
      -------------------------------------------------------- */

      if (
        action ===
        'temperature-trend'
      ) {
        const requestedHours =
          Number(
            body?.hours ?? 12,
          );

        const hours =
          Number.isFinite(
            requestedHours,
          )
            ? requestedHours
            : 12;

        let baseTemperature =
          Number(
            body?.temperature,
          );

        let heatmapActivityId:
          | string
          | null =
            null;

        let temperatureSource:
          | string
          | null =
            null;

        /*
          If Angular already has
          a valid temperature,
          it can send it directly.

          Otherwise obtain it
          from /v1/heatmap.
        */

        if (
          !Number.isFinite(
            baseTemperature,
          )
        ) {
          const heatmapResult =
            await heatmap(
              coordinates,
            );

          heatmapActivityId =
            heatmapResult
              .activityId;

          temperatureSource =
            heatmapResult
              .temperatureSource;

          if (
            heatmapResult.temperature ===
            null
          ) {
            throw new Error(
              'FortyGuard heatmap completed but no valid temperature was returned for the temperature trend.',
            );
          }

          baseTemperature =
            heatmapResult
              .temperature;
        } else {
          temperatureSource =
            'client-provided';
        }

        const trend =
          await temperatureTrend(
            coordinates,
            baseTemperature,
            hours,
          );

        return jsonResponse({
          success: true,

          action,

          data: {
            ...trend,

            heatmapActivityId,

            temperatureSource,
          },
        });
      }

      /* --------------------------------------------------------
         SATELLITE SEGMENTATION
      -------------------------------------------------------- */

      if (
        action ===
        'satellite-segmentation'
      ) {
        const data =
          await satellite(
            coordinates,
          );

        return jsonResponse({
          success: true,

          action,

          data,
        });
      }

      return jsonResponse(
        {
          success: false,

          error:
            'Unknown action. Use current-temperature, environmental-parameters, temperature-trend, satellite-segmentation, or health.',
        },
        400,
      );
    } catch (
      error
    ) {
      console.error(
        '[FortyGuard] proxy error',
        error,
      );

      if (
        error instanceof
        FortyGuardHttpError
      ) {
        return jsonResponse(
          {
            success: false,

            error:
              'FortyGuard API error',

            message:
              error.message,

            endpoint:
              error.endpoint,

            status:
              error.status,

            body:
              error.safeBody,
          },
          502,
        );
      }

      return jsonResponse(
        {
          success: false,

          error:
            'Edge Function internal error',

          message:
            error instanceof Error
              ? error.message
              : 'Unknown error',
        },
        500,
      );
    }
  },
);