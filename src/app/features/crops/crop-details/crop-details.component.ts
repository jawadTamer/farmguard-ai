import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import Swal from 'sweetalert2';
import { firstValueFrom } from 'rxjs';

import { CropService } from '../../../core/services/crop.service';
import { ZoneService } from '../../../core/services/zone.service';
import { FarmService } from '../../../core/services/farm.service';
import { TemperatureService } from '../../../core/services/temperature.service';
import { CropHeatRiskService } from '../../../core/services/crop-heat-risk.service';
import { AlertService } from '../../../core/services/alert.service';
import { RiskService } from '../../../core/services/risk.service';
import { Crop } from '../../../core/models/crop.model';
import { FarmZone } from '../../../core/models/farm-zone.model';
import { Farm } from '../../../core/models/farm.model';
import { CropHeatRiskResponse } from '../../../core/models/crop-heat-risk.model';
import { TemperatureReading } from '../../../core/models/temperature.model';

@Component({
  selector: 'app-crop-details',
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
  templateUrl: './crop-details.component.html',
  styleUrl: './crop-details.component.css',
})
export class CropDetailsComponent implements OnInit {
  cropId = '';
  crop?: Crop;
  zone?: FarmZone;
  farm?: Farm;
  isLoading = true;
  isLoadingHeatRisk = false;
  errorMessage = '';
  heatRiskError = '';
  heatRiskResponse?: CropHeatRiskResponse;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cropService: CropService,
    private zoneService: ZoneService,
    private farmService: FarmService,
    private temperatureService: TemperatureService,
    private heatRiskService: CropHeatRiskService,
    private alertService: AlertService,
    private riskService: RiskService,
  ) { }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.errorMessage = 'Crop information is missing.';
      this.isLoading = false;
      return;
    }
    this.cropId = id;
    void this.loadData();
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const crop = await this.cropService.getCropById(this.cropId);
      this.crop = crop;

      if (!this.crop) {
        this.errorMessage = 'Crop not found.';
        this.isLoading = false;
        return;
      }

      if (this.crop.zoneId) {
        this.zone = await this.zoneService.getZoneById(this.crop.zoneId);

        if (this.zone?.farmId) {
          this.farm = await this.farmService.getFarmById(this.zone.farmId);
        }
      }

      // Load heat risk prediction
      await this.loadHeatRiskPrediction();
    } catch (error) {
      console.error('Failed to load crop:', error);
      this.errorMessage = 'Unable to load crop information.';
    } finally {
      this.isLoading = false;
    }
  }

  async loadHeatRiskPrediction(): Promise<void> {
    if (!this.crop) {
      this.heatRiskError = 'Crop data not available.';
      return;
    }

    if (!this.zone) {
      this.heatRiskError = 'Zone data not available. Heat risk assessment requires the crop to be assigned to a zone.';
      return;
    }

    if (!this.farm) {
      this.heatRiskError = 'Farm data not available. Heat risk assessment requires the zone to be assigned to a farm.';
      return;
    }

    this.isLoadingHeatRisk = true;
    this.heatRiskError = '';

    try {
      // Get current weather data
      let currentWeather: TemperatureReading | undefined;
      try {
        currentWeather = await this.temperatureService.getCurrentTemperature(
          this.farm.id,
          this.zone.id
        );
      } catch (weatherError) {
        console.warn('Could not fetch current weather data:', weatherError);
        // Continue without weather data - service will use defaults
      }

      // Build request
      const request = this.heatRiskService.buildRequestFromCropData(
        this.crop,
        this.zone,
        this.farm,
        currentWeather
      );

      if (!request) {
        this.heatRiskError = 'Unable to calculate heat risk. Missing required data: planting date or invalid growth stage.';
        return;
      }

      // Call prediction API via Supabase Edge Function
      this.heatRiskResponse = await firstValueFrom(this.heatRiskService.predict(request));

      // Extract and log the risk class from ML response
      if (this.heatRiskResponse && this.heatRiskResponse.predictions.length > 0) {
        const prediction = this.heatRiskResponse.predictions[0];
        const riskClass = prediction.heat_risk_class;
        const confidence = prediction.probabilities[riskClass];
        console.log('ML Risk Class extracted:', riskClass);
        console.log('ML Confidence:', confidence);

        const temperature = currentWeather?.temperature ?? request.temperature_c;
        const humidity = currentWeather?.humidity ?? request.relative_humidity_percent;

        // Create alert based on ML prediction
        await this.alertService.createCropHeatRiskAlert(
          this.farm.id,
          this.zone.id,
          this.crop.id,
          this.heatRiskResponse,
          temperature,
          humidity,
          this.crop.growthStage,
          this.zone.name,
          this.crop.cropType
        );

        // Save risk assessment to database
        await this.riskService.saveCropHeatRiskAssessment(
          this.farm.id,
          this.zone.id,
          this.crop.id,
          this.heatRiskResponse,
          temperature,
          humidity,
          this.crop.growthStage
        );
      }
    } catch (error) {
      console.error('Failed to load heat risk prediction:', error);

      // Map error codes to user-friendly messages
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
          this.heatRiskError = 'Unable to calculate crop heat risk right now.';
          break;
      }
    } finally {
      this.isLoadingHeatRisk = false;
    }
  }

  goBack(): void {
    this.router.navigate(['/crops']);
  }

  editCrop(): void {
    this.router.navigate(['/crops', this.cropId, 'edit']);
  }

  async deleteCrop(): Promise<void> {
    if (!this.crop) {
      return;
    }

    const result = await Swal.fire({
      title: 'Delete crop?',
      text: `"${this.crop.cropType}" will be permanently deleted.`,
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
      await this.cropService.deleteCrop(this.cropId);

      await Swal.fire({
        title: 'Deleted',
        text: 'Crop deleted successfully.',
        icon: 'success',
        timer: 1800,
        showConfirmButton: false,
      });

      await this.router.navigate(['/crops']);
    } catch (error) {
      console.error('Failed to delete crop:', error);
      this.errorMessage = 'Failed to delete the crop.';

      await Swal.fire({
        title: 'Delete failed',
        text: 'Unable to delete this crop. Please try again.',
        icon: 'error',
      });
    }
  }

  getCreatedDate(): string {
    if (!this.crop?.createdAt) {
      return 'Not available';
    }
    return new Date(this.crop.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  getPlantingDate(): string {
    if (!this.crop?.plantingDate) {
      return 'Not specified';
    }
    return new Date(this.crop.plantingDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  getHeatRiskClass(): string {
    if (!this.heatRiskResponse?.predictions?.[0]) {
      return 'Unknown';
    }
    return this.heatRiskResponse.predictions[0].heat_risk_class;
  }

  getHeatRiskConfidence(): string {
    if (!this.heatRiskResponse?.predictions?.[0]) {
      return '0%';
    }

    const prediction = this.heatRiskResponse.predictions[0];
    const riskClass = prediction.heat_risk_class;
    const probability = prediction.probabilities[riskClass];

    return (probability * 100).toFixed(2) + '%';
  }

  getHeatRiskProbability(riskClass: string): string {
    if (!this.heatRiskResponse?.predictions?.[0]) {
      return '0%';
    }

    const prediction = this.heatRiskResponse.predictions[0];
    const probability = prediction.probabilities[riskClass as keyof typeof prediction.probabilities];
    return (probability * 100).toFixed(2) + '%';
  }

  getHeatRiskProbabilityValue(riskClass: string): number {
    if (!this.heatRiskResponse?.predictions?.[0]) {
      return 0;
    }

    const prediction = this.heatRiskResponse.predictions[0];
    const probability = prediction.probabilities[riskClass as keyof typeof prediction.probabilities];
    return probability * 100;
  }

  getHeatRiskColor(riskClass: string): string {
    switch (riskClass) {
      case 'Low':
        return '#4caf50';
      case 'Moderate':
        return '#ff9800';
      case 'High':
        return '#f44336';
      case 'Critical':
        return '#b71c1c';
      default:
        return '#9e9e9e';
    }
  }
}
