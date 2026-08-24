import { SupabaseService } from '../services/supabase.service';

interface FortyGuardResponse<T> {
  success: boolean;
  action?: string;
  data?: T;
  error?: string;
  message?: string;
}

interface SatelliteSubmitResponse {
  activityId: string;
  dateTime?: { startDate: string; startTime: string };
}

interface SatelliteStatusResponse {
  activityId: string;
  status: string;
  done: boolean;
  message?: string | null;
  resultReceived?: boolean;
  coordinates?: { latitude: number; longitude: number };
  imageYear?: number | null;
  originalImage?: string | null;
  segmentedImage?: string | null;
  original_image?: string | null;
  image_content?: string | null;
  segments?: Record<string, number>;
  imageLegend?: Record<string, unknown>;
  imageDimensions?: { height?: number; width?: number } | null;
  processingTimeSeconds?: number | null;
}

export interface SatelliteSegmentationResult {
  activityId: string;
  coordinates: { latitude: number; longitude: number };
  imageYear: number | null;
  originalImage: string | null;
  segmentedImage: string | null;
  segments: Record<string, number>;
  imageLegend: Record<string, unknown>;
  imageDimensions: { height?: number; width?: number } | null;
  processingTimeSeconds: number | null;
  mode: string;
  resultReceived: boolean;
}

export class FortyGuardSatelliteProvider {
  private readonly pollIntervalMs = 2000;
  private readonly maxPolls = 45;

  constructor(private readonly supabaseService: SupabaseService) {}

  async getSegmentation(
    latitude: number,
    longitude: number,
  ): Promise<SatelliteSegmentationResult> {
    // Submit once. The Edge Function never waits for the FortyGuard job,
    // which prevents Supabase WORKER_RESOURCE_LIMIT / 546 errors.
    const submitted = await this.invoke<SatelliteSubmitResponse>({
      action: 'satellite-segmentation-submit',
      latitude,
      longitude,
    });

    const activityId = submitted.activityId;
    if (!activityId) {
      throw new Error('Satellite segmentation did not return an activity ID.');
    }

    // Poll from the browser, not inside the Edge Function.
    // Nothing is exposed to the UI unless the caller chooses to show loading state.
    for (let attempt = 0; attempt < this.maxPolls; attempt++) {
      if (attempt > 0) {
        await this.delay(this.pollIntervalMs);
      }

      const status = await this.invoke<SatelliteStatusResponse>({
        action: 'satellite-segmentation-status',
        activityId,
        latitude,
        longitude,
      });

      if (status.done) {
        return {
          activityId: status.activityId || activityId,
          coordinates: status.coordinates ?? { latitude, longitude },
          imageYear: status.imageYear ?? null,
          originalImage: status.originalImage ?? status.original_image ?? null,
          segmentedImage: status.segmentedImage ?? status.image_content ?? null,
          segments: status.segments ?? {},
          imageLegend: status.imageLegend ?? {},
          imageDimensions: status.imageDimensions ?? null,
          processingTimeSeconds: status.processingTimeSeconds ?? null,
          mode: 'sat',
          resultReceived: status.resultReceived === true,
        };
      }

      if (['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(
        String(status.status ?? '').toLowerCase(),
      )) {
        throw new Error(
          status.message ?? 'FortyGuard satellite segmentation failed.',
        );
      }
    }

    throw new Error(
      'Satellite segmentation is still processing. Please refresh and try again shortly.',
    );
  }

  private async invoke<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabaseService.client.functions.invoke<
      FortyGuardResponse<T>
    >('fortyguard-proxy', { body });

    if (error) {
      throw new Error(`Satellite segmentation request failed: ${error.message}`);
    }

    if (!data?.success || !data.data) {
      throw new Error(
        data?.message ?? data?.error ?? 'Invalid satellite segmentation response.',
      );
    }

    return data.data;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
