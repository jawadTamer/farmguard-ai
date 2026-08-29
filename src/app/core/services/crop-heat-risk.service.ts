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

  constructor(private readonly http: HttpClient) { }

  predict(request: CropHeatRiskRequest): Observable<CropHeatRiskResponse> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${environment.supabaseKey}`,
    });

    return this.http.post<EdgeFunctionResponse>(this.apiUrl, request, { headers }).pipe(
      map((response) => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Heat-risk prediction failed');
        }
        return response.data;
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('Crop heat risk prediction failed:', error);

        // Handle Edge Function error responses
        if (error.error?.error) {
          return throwError(() => new Error(error.error.error));
        }

        return throwError(
          () => new Error('Heat-risk prediction is currently unavailable.')
        );
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