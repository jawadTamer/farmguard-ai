import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

export interface AIAdvisorLivestockRequest {
  context: 'livestock_heat_risk';
  livestock_type: string;
  breed?: string;
  sex?: string;
  physiological_stage?: string;
  age_years?: number;
  weight_kg?: number;
  risk_level: 'Low' | 'Moderate' | 'High' | 'Critical';
  thi?: number;
  hli?: number;
  temperature_c: number;
  humidity_percent: number;
  probabilities?: {
    Critical: number;
    High: number;
    Low: number;
    Moderate: number;
  };
}

export interface AIAdvisorRecommendation {
  title: string;
  description: string;
  priority: 'High' | 'Moderate' | 'Low';
}

export interface AIAdvisorResponse {
  recommendation: string;
  actions: string[];
  risk_explanation: string;
  priority: 'High' | 'Moderate' | 'Low';
}

interface EdgeFunctionResponse {
  success: boolean;
  data?: AIAdvisorResponse;
  error?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AIAdvisorService {
  private apiUrl = environment.aiAdvisorApiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  getLivestockRecommendations(request: AIAdvisorLivestockRequest): Observable<AIAdvisorResponse> {
    const sessionSignal = this.authService.session;
    const session = sessionSignal();
    const accessToken = session?.access_token;

    if (!accessToken) {
      console.error('[AIAdvisorService] No authenticated session found');
      return throwError(() => new Error('AUTHENTICATION_REQUIRED'));
    }

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    });

    console.log('Sending AI advisor request for livestock:', this.apiUrl);
    console.log('Request data:', JSON.stringify(request, null, 2));

    return this.http.post<EdgeFunctionResponse>(this.apiUrl, request, { headers }).pipe(
      map((response: EdgeFunctionResponse) => {
        console.log('AI advisor response received:', response);
        if (!response.success || !response.data) {
          throw new Error(response.error || 'AI advisor request failed');
        }
        console.log('Extracted AI recommendations:', response.data);
        return response.data;
      }),
      catchError((error) => {
        console.error('AI advisor request failed:', error);

        const errorCode = error.error?.error;
        const errorMessage = error.error?.message;

        if (errorCode) {
          console.error(`[AIAdvisorService] Edge Function error code: ${errorCode}`);

          switch (errorCode) {
            case 'AI_API_TIMEOUT':
              return throwError(() => new Error('AI_API_TIMEOUT'));
            case 'AI_API_UNREACHABLE':
              return throwError(() => new Error('AI_API_UNREACHABLE'));
            case 'AI_API_HTTP_ERROR':
              return throwError(() => new Error('AI_API_HTTP_ERROR'));
            case 'AI_API_INVALID_RESPONSE':
              return throwError(() => new Error('AI_API_INVALID_RESPONSE'));
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
          return throwError(() => new Error('AI advisor service not found.'));
        }
        if (error.status === 500) {
          return throwError(() => new Error('CONFIGURATION_ERROR'));
        }
        if (error.status === 502) {
          return throwError(() => new Error('AI_API_HTTP_ERROR'));
        }
        if (error.status === 503) {
          return throwError(() => new Error('AI_API_UNREACHABLE'));
        }
        if (error.status === 504) {
          return throwError(() => new Error('AI_API_TIMEOUT'));
        }

        return throwError(() => new Error('UNKNOWN'));
      })
    );
  }

  buildLivestockRequest(
    livestock: any,
    heatRiskResponse: any,
    temperature: number,
    humidity: number
  ): AIAdvisorLivestockRequest {
    const prediction = heatRiskResponse?.predictions?.[0];
    
    return {
      context: 'livestock_heat_risk',
      livestock_type: livestock.livestockType,
      breed: livestock.breed,
      sex: livestock.sex,
      physiological_stage: livestock.physiologicalStage,
      age_years: livestock.ageYears,
      weight_kg: livestock.weightKg,
      risk_level: prediction?.risk_level || 'Low',
      thi: prediction?.calculated_features?.thi,
      hli: prediction?.calculated_features?.hli,
      temperature_c: temperature,
      humidity_percent: humidity,
      probabilities: prediction?.probabilities,
    };
  }
}
