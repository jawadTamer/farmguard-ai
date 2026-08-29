import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import {
  CropHeatRiskRequest,
  CropHeatRiskResponse,
} from '../models/crop-heat-risk.model';
import { Crop } from '../models/crop.model';
import { FarmZone } from '../models/farm-zone.model';
import { Farm } from '../models/farm.model';
import { TemperatureReading } from '../models/temperature.model';
import { AuthService } from '../auth/auth.service';

interface EdgeFunctionResponse {
  success: boolean;
  data?: CropHeatRiskResponse;
  error?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root',
})
export class CropHeatRiskService {
  private readonly apiUrl = environment.cropHeatRiskApiUrl;

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService
  ) { }

  predict(request: CropHeatRiskRequest): Observable<CropHeatRiskResponse> {
    const session = this.authService.session();
    const accessToken = session?.access_token;

    if (!accessToken) {
      console.error('[CropHeatRiskService] No authenticated session found');
      return throwError(() => new Error('AUTHENTICATION_REQUIRED'));
    }

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    });

    console.log('Sending heat-risk prediction request to Edge Function:', this.apiUrl);
    console.log('Request data:', { ...request, growth_stage: request.growth_stage });

    return this.http.post<EdgeFunctionResponse>(this.apiUrl, request, { headers }).pipe(
      map((response) => {
        console.log('Edge Function response received:', response);
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Heat-risk prediction failed');
        }
        console.log('Extracted ML prediction:', response.data);
        return response.data;
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('Crop heat risk prediction failed:', error);
        console.error('HTTP Status:', error.status);
        console.error('HTTP Status Text:', error.statusText);
        console.error('Error body:', error.error);

        // Handle Edge Function error responses with specific error codes
        const errorCode = error.error?.error;
        const errorMessage = error.error?.message;

        if (errorCode) {
          console.error(`[CropHeatRiskService] Edge Function error code: ${errorCode}`);

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

        // Handle specific HTTP status codes
        if (error.status === 401) {
          return throwError(() => new Error('AUTHENTICATION_REQUIRED'));
        }
        if (error.status === 403) {
          return throwError(() => new Error('Access denied. Check your permissions.'));
        }
        if (error.status === 404) {
          return throwError(() => new Error('Heat-risk prediction service not found.'));
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

  buildRequestFromCropData(
    crop: Crop,
    zone: FarmZone,
    farm: Farm,
    currentWeather?: TemperatureReading
  ): CropHeatRiskRequest | null {
    const now = new Date();

    // Calculate days since planting
    let daysSincePlanting = 0;
    if (crop.plantingDate) {
      const plantingDate = new Date(crop.plantingDate);
      const diffTime = now.getTime() - plantingDate.getTime();
      daysSincePlanting = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    } else {
      console.warn('Planting date is missing for crop:', crop.id);
      return null;
    }

    // Validate growth stage
    const validGrowthStages = ['maturity', 'planted', 'reproductive', 'vegetative'];
    if (!validGrowthStages.includes(crop.growthStage)) {
      console.warn('Invalid growth stage for crop:', crop.growthStage);
      return null;
    }

    // Get location data - prefer zone, then farm
    const latitude = zone.latitude ?? farm.latitude ?? 0;
    const longitude = zone.longitude ?? farm.longitude ?? 0;
    const location = farm.location || 'Unknown';

    // Get current date/time values
    const hour = now.getHours();
    const dayOfYear = this.getDayOfYear(now);
    const month = now.getMonth() + 1; // JavaScript months are 0-indexed

    // Get weather data with fallbacks
    const temperature = currentWeather?.temperature ?? 25.0;
    const humidity = currentWeather?.humidity ?? 60.0;

    // Solar radiation values - these are not currently available in FarmGuard
    // Using placeholder values as documented in the missing field handling
    const ghi = 850.0; // Global Horizontal Irradiance
    const dni = 900.0; // Direct Normal Irradiance  
    const dhi = 150.0; // Diffuse Horizontal Irradiance

    // Calculate approximate heat index
    const heatIndex = this.calculateHeatIndex(temperature, humidity);

    return {
      hour,
      day_of_year: dayOfYear,
      month,
      temperature_c: temperature,
      relative_humidity_percent: humidity,
      ghi_w_m2: ghi,
      dni_w_m2: dni,
      dhi_w_m2: dhi,
      location,
      latitude,
      longitude,
      days_since_planting: daysSincePlanting,
      growth_stage: crop.growthStage as 'maturity' | 'planted' | 'reproductive' | 'vegetative',
      heat_index_approx: heatIndex,
    };
  }

  private getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  private calculateHeatIndex(temperatureC: number, humidityPercent: number): number {
    // Simple heat index approximation
    // Convert to Fahrenheit for calculation
    const tempF = (temperatureC * 9 / 5) + 32;

    if (tempF < 80 || humidityPercent < 40) {
      return tempF; // Heat index is approximately temperature in these conditions
    }

    // Rothfusz regression equation
    const T = tempF;
    const RH = humidityPercent;

    const heatIndexF =
      -42.379 +
      2.04901523 * T +
      10.14333127 * RH -
      0.22475541 * T * RH -
      0.00683783 * T * T -
      0.05481717 * RH * RH +
      0.00122874 * T * T * RH +
      0.00085282 * T * RH * RH -
      0.00000199 * T * T * RH * RH;

    // Convert back to Celsius
    return (heatIndexF - 32) * 5 / 9;
  }
}