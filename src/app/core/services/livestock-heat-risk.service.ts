import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

export interface LivestockHeatRiskRequest {
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

export interface LivestockHeatRiskProbabilities {
  Critical: number;
  High: number;
  Low: number;
  Moderate: number;
}

export interface LivestockCalculatedFeatures {
  hli: number;
  thi: number;
}

export interface LivestockHeatRiskPrediction {
  calculated_features: LivestockCalculatedFeatures;
  probabilities: LivestockHeatRiskProbabilities;
  risk_level: 'Low' | 'Moderate' | 'High' | 'Critical';
}

export interface LivestockHeatRiskResponse {
  predictions: LivestockHeatRiskPrediction[];
  status: string;
}

interface EdgeFunctionResponse {
  success: boolean;
  data?: LivestockHeatRiskResponse;
  error?: string;
  message?: string;
  upstream_status?: number;
}

@Injectable({
  providedIn: 'root',
})
export class LivestockHeatRiskService {
  private apiUrl = environment.livestockHeatRiskApiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  predict(request: LivestockHeatRiskRequest): Observable<LivestockHeatRiskResponse> {
    const sessionSignal = this.authService.session;
    const session = sessionSignal();
    const accessToken = session?.access_token;

    if (!accessToken) {
      console.error('[LivestockHeatRiskService] No authenticated session found');
      return throwError(() => new Error('AUTHENTICATION_REQUIRED'));
    }

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    });

    console.log('Sending livestock heat-risk prediction request to Edge Function:', this.apiUrl);
    console.log('Request data:', JSON.stringify(request, null, 2));

    return this.http.post<EdgeFunctionResponse>(this.apiUrl, request, { headers }).pipe(
      map((response: EdgeFunctionResponse) => {
        console.log('Edge Function response received:', response);
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Livestock heat-risk prediction failed');
        }
        console.log('Extracted ML prediction:', response.data);
        return response.data;
      }),
      catchError((error) => {
        console.error('Livestock heat risk prediction failed:', error);

        const errorCode = error.error?.error;
        const errorMessage = error.error?.message;

        if (errorCode) {
          console.error(`[LivestockHeatRiskService] Edge Function error code: ${errorCode}`);

          switch (errorCode) {
            case 'ML_API_TIMEOUT':
              return throwError(() => new Error('ML_API_TIMEOUT'));
            case 'ML_API_UNREACHABLE':
              return throwError(() => new Error('ML_API_UNREACHABLE'));
            case 'ML_API_HTTP_ERROR':
              return throwError(() => new Error('ML_API_HTTP_ERROR'));
            case 'ML_API_INVALID_RESPONSE':
              return throwError(() => new Error('ML_API_INVALID_RESPONSE'));
            case 'CONFIGURATION_ERROR':
              return throwError(() => new Error('CONFIGURATION_ERROR'));
            case 'AUTHENTICATION_REQUIRED':
              return throwError(() => new Error('AUTHENTICATION_REQUIRED'));
            default:
              return throwError(() => new Error('UNKNOWN'));
          }
        }

        if (error.status === 401) {
          return throwError(() => new Error('AUTHENTICATION_REQUIRED'));
        }
        if (error.status === 403) {
          return throwError(() => new Error('Access denied. Check your permissions.'));
        }
        if (error.status === 404) {
          return throwError(() => new Error('Livestock heat-risk prediction service not found.'));
        }
        if (error.status === 500) {
          return throwError(() => new Error('CONFIGURATION_ERROR'));
        }
        if (error.status === 502) {
          return throwError(() => new Error('ML_API_HTTP_ERROR'));
        }
        if (error.status === 503) {
          return throwError(() => new Error('ML_API_UNREACHABLE'));
        }
        if (error.status === 504) {
          return throwError(() => new Error('ML_API_TIMEOUT'));
        }

        return throwError(() => new Error('UNKNOWN'));
      })
    );
  }

  buildRequestFromLivestock(
    livestock: any,
    zone: any,
    farm: any,
    currentWeather?: any
  ): LivestockHeatRiskRequest | null {
    // Validate required fields
    if (!livestock.sex) {
      console.warn('Sex is required for livestock heat risk prediction');
      return null;
    }

    if (livestock.ageYears === undefined || livestock.ageYears === null) {
      console.warn('Age years is required for livestock heat risk prediction');
      return null;
    }

    if (livestock.weightKg === undefined || livestock.weightKg === null) {
      console.warn('Weight kg is required for livestock heat risk prediction');
      return null;
    }

    // Get location data - prefer zone, then farm
    const latitude = zone.latitude ?? farm.latitude ?? 0;
    const longitude = zone.longitude ?? farm.longitude ?? 0;

    // Get weather data with fallbacks
    const temperature = currentWeather?.temperature ?? 25.0;
    const humidity = currentWeather?.humidity ?? 60.0;

    return {
      species: livestock.livestockType,
      breed: livestock.breed,
      sex: livestock.sex,
      physiological_stage: livestock.physiologicalStage,
      age_years: livestock.ageYears,
      weight_kg: livestock.weightKg,
      latitude,
      longitude,
      temperature_c: temperature,
      humidity_percent: humidity,
    };
  }
}
