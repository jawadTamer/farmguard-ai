import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import Swal from 'sweetalert2';

import { LivestockService } from '../../../core/services/livestock.service';
import { ZoneService } from '../../../core/services/zone.service';
import { LivestockHeatRiskService } from '../../../core/services/livestock-heat-risk.service';
import { AIAdvisorService } from '../../../core/services/ai-advisor.service';
import { Livestock } from '../../../core/models/livestock.model';
import { FarmZone } from '../../../core/models/farm-zone.model';
import { FarmService } from '../../../core/services/farm.service';
import { TemperatureService } from '../../../core/services/temperature.service';

@Component({
  selector: 'app-livestock-details',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatChipsModule,
  ],
  templateUrl: './livestock-details.component.html',
  styleUrl: './livestock-details.component.css',
})
export class LivestockDetailsComponent implements OnInit {
  livestockId = '';
  livestock?: Livestock;
  zone?: FarmZone;
  farm?: any;
  isLoading = true;
  isLoadingHeatRisk = false;
  errorMessage = '';
  heatRiskResponse?: any;
  heatRiskError = '';
  aiRecommendations?: any;
  isLoadingRecommendations = false;
  recommendationsError = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private livestockService: LivestockService,
    private zoneService: ZoneService,
    private heatRiskService: LivestockHeatRiskService,
    private farmService: FarmService,
    private aiAdvisorService: AIAdvisorService,
    private temperatureService: TemperatureService,
  ) { }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.errorMessage = 'Livestock information is missing.';
      this.isLoading = false;
      return;
    }
    this.livestockId = id;
    void this.loadData();
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const livestock = await this.livestockService.getLivestockById(
        this.livestockId,
      );
      this.livestock = livestock;

      if (!this.livestock) {
        this.errorMessage = 'Livestock not found.';
        this.isLoading = false;
        return;
      }

      if (this.livestock.zoneId) {
        this.zone = await this.zoneService.getZoneById(this.livestock.zoneId);
        if (this.zone) {
          this.farm = await this.farmService.getFarmById(this.zone.farmId);
        }
      }
    } catch (error) {
      console.error('Failed to load livestock:', error);
      this.errorMessage = 'Unable to load livestock information.';
    } finally {
      this.isLoading = false;
    }
  }

  goBack(): void {
    this.router.navigate(['/livestock']);
  }

  editLivestock(): void {
    this.router.navigate(['/livestock', this.livestockId, 'edit']);
  }

  async deleteLivestock(): Promise<void> {
    if (!this.livestock) {
      return;
    }

    const result = await Swal.fire({
      title: 'Delete livestock?',
      text: `"${this.livestock.livestockType}" will be permanently deleted.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#d32f2f',
      reverseButtons: true,
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      await this.livestockService.deleteLivestock(this.livestockId);

      await Swal.fire({
        title: 'Deleted',
        text: 'Livestock deleted successfully.',
        icon: 'success',
        timer: 1800,
        showConfirmButton: false,
      });

      await this.router.navigate(['/livestock']);
    } catch (error) {
      console.error('Failed to delete livestock:', error);
      this.errorMessage = 'Failed to delete the livestock.';

      await Swal.fire({
        title: 'Delete failed',
        text: 'Unable to delete this livestock. Please try again.',
        icon: 'error',
      });
    }
  }

  getCreatedDate(): string {
    if (!this.livestock?.createdAt) {
      return 'Not available';
    }
    return new Date(this.livestock.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  async loadHeatRiskPrediction(): Promise<void> {
    if (!this.livestock) {
      this.heatRiskError = 'Livestock data not available.';
      return;
    }

    if (!this.zone) {
      this.heatRiskError = 'Zone data not available. Heat risk assessment requires the livestock to be assigned to a zone.';
      return;
    }

    if (!this.farm) {
      this.heatRiskError = 'Farm data not available. Heat risk assessment requires the zone to be assigned to a farm.';
      return;
    }

    this.isLoadingHeatRisk = true;
    this.heatRiskError = '';

    try {
      const request = this.heatRiskService.buildRequestFromLivestock(
        this.livestock,
        this.zone,
        this.farm
      );

      if (!request) {
        this.heatRiskError = 'Unable to calculate heat risk. Missing required data: sex, age, or weight.';
        return;
      }

      this.heatRiskResponse = await firstValueFrom(this.heatRiskService.predict(request));

      if (this.heatRiskResponse && this.heatRiskResponse.predictions.length > 0) {
        const prediction = this.heatRiskResponse.predictions[0];
        console.log('Livestock Risk Level:', prediction.risk_level);
        console.log('Livestock Probabilities:', prediction.probabilities);

        // Load AI recommendations after successful heat risk prediction
        await this.loadAIRecommendations();
      }
    } catch (error) {
      console.error('Failed to load heat risk prediction:', error);

      const errorMessage = error instanceof Error ? error.message : 'UNKNOWN';

      switch (errorMessage) {
        case 'ML_API_TIMEOUT':
          this.heatRiskError = 'The heat-risk model is taking too long to respond. Please try again in a moment.';
          break;
        case 'ML_API_UNREACHABLE':
          this.heatRiskError = 'The heat-risk model is currently unavailable. Please try again later.';
          break;
        case 'ML_API_HTTP_ERROR':
          this.heatRiskError = 'The heat-risk model returned an error. Please try again later.';
          break;
        case 'ML_API_INVALID_RESPONSE':
          this.heatRiskError = 'The heat-risk model returned an invalid result.';
          break;
        case 'CONFIGURATION_ERROR':
          this.heatRiskError = 'Heat-risk prediction is temporarily unavailable.';
          break;
        case 'AUTHENTICATION_REQUIRED':
          this.heatRiskError = 'Authentication required. Please sign in again.';
          break;
        case 'UNKNOWN':
        default:
          this.heatRiskError = 'Unable to calculate livestock heat risk right now.';
          break;
      }
    } finally {
      this.isLoadingHeatRisk = false;
    }
  }

  async loadAIRecommendations(): Promise<void> {
    if (!this.livestock || !this.heatRiskResponse) {
      this.recommendationsError = 'Livestock or heat risk data not available.';
      return;
    }

    this.isLoadingRecommendations = true;
    this.recommendationsError = '';

    try {
      // Get current temperature data
      let temperature = 25.0;
      let humidity = 60.0;

      if (this.farm) {
        try {
          const currentWeather = await this.temperatureService.getCurrentTemperature(this.farm.id);
          if (currentWeather) {
            temperature = Number(currentWeather.temperature) || 25.0;
            humidity = Number(currentWeather.humidity) || 60.0;
          }
        } catch (error) {
          console.warn('Failed to load current weather, using defaults:', error);
        }
      }

      // Build AI advisor request
      const request = this.aiAdvisorService.buildLivestockRequest(
        this.livestock,
        this.heatRiskResponse,
        temperature,
        humidity
      );

      // Get AI recommendations
      this.aiRecommendations = await firstValueFrom(
        this.aiAdvisorService.getLivestockRecommendations(request)
      );

      console.log('AI Recommendations received:', this.aiRecommendations);
    } catch (error) {
      console.error('Failed to load AI recommendations:', error);

      const errorMessage = error instanceof Error ? error.message : 'UNKNOWN';

      switch (errorMessage) {
        case 'AI_API_TIMEOUT':
          this.recommendationsError = 'The AI advisor is taking too long to respond. Please try again in a moment.';
          break;
        case 'AI_API_UNREACHABLE':
          this.recommendationsError = 'The AI advisor is currently unavailable. Please try again later.';
          break;
        case 'AI_API_HTTP_ERROR':
          this.recommendationsError = 'The AI advisor returned an error. Please try again later.';
          break;
        case 'AI_API_INVALID_RESPONSE':
          this.recommendationsError = 'The AI advisor returned an invalid result.';
          break;
        case 'CONFIGURATION_ERROR':
          this.recommendationsError = 'AI recommendations are temporarily unavailable.';
          break;
        case 'AUTHENTICATION_REQUIRED':
          this.recommendationsError = 'Authentication required. Please sign in again.';
          break;
        case 'UNKNOWN':
        default:
          this.recommendationsError = 'Unable to load AI recommendations right now.';
          break;
      }
    } finally {
      this.isLoadingRecommendations = false;
    }
  }
}
