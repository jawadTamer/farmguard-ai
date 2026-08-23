import { SupabaseService } from '../services/supabase.service';

interface FortyGuardResponse<T> {
  success: boolean;
  action?: string;
  data?: T;
  error?: string;
  message?: string;
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
  constructor(private readonly supabaseService: SupabaseService) {}

  async getSegmentation(
    latitude: number,
    longitude: number,
  ): Promise<SatelliteSegmentationResult> {
    const { data, error } = await this.supabaseService.client.functions.invoke<
      FortyGuardResponse<SatelliteSegmentationResult>
    >('fortyguard-proxy', {
      body: {
        action: 'satellite-segmentation',
        latitude,
        longitude,
      },
    });

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
}
