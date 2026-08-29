import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

import { CropHeatRiskService } from './crop-heat-risk.service';
import { CropHeatRiskRequest, CropHeatRiskResponse } from '../models/crop-heat-risk.model';
import { Crop } from '../models/crop.model';
import { FarmZone } from '../models/farm-zone.model';
import { Farm } from '../models/farm.model';
import { TemperatureReading } from '../models/temperature.model';

describe('CropHeatRiskService', () => {
  let service: CropHeatRiskService;
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;

  const mockCrop: Crop = {
    id: 'crop-1',
    zoneId: 'zone-1',
    cropType: 'Wheat',
    variety: 'Desert Gold',
    growthStage: 'vegetative',
    plantingDate: '2024-06-15',
  };

  const mockZone: FarmZone = {
    id: 'zone-1',
    farmId: 'farm-1',
    name: 'Field A',
    latitude: 37.5,
    longitude: -77.5,
  };

  const mockFarm: Farm = {
    id: 'farm-1',
    name: 'Green Valley Farm',
    location: 'Arkansas',
    latitude: 37.5,
    longitude: -77.5,
    status: 'active',
  };

  const mockWeather: TemperatureReading = {
    id: 'temp-1',
    farmId: 'farm-1',
    zoneId: 'zone-1',
    temperature: 35.0,
    humidity: 70.0,
    recordedAt: new Date().toISOString(),
    source: 'api',
  };

  const mockMLResponse: CropHeatRiskResponse = {
    predictions: [
      {
        heat_risk_class: 'Low',
        probabilities: {
          Critical: 0.000003,
          High: 0.00013,
          Low: 0.9988,
          Moderate: 0.00105,
        },
      },
    ],
    status: 'success',
  };

  const mockEdgeFunctionResponse = {
    success: true,
    data: mockMLResponse,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [CropHeatRiskService],
    });

    service = TestBed.inject(CropHeatRiskService);
    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('predict', () => {
    it('should send POST request to Supabase Edge Function', () => {
      const mockRequest: CropHeatRiskRequest = {
        hour: 14,
        day_of_year: 210,
        month: 7,
        temperature_c: 35.0,
        relative_humidity_percent: 70.0,
        ghi_w_m2: 850.0,
        dni_w_m2: 900.0,
        dhi_w_m2: 150.0,
        location: 'Arkansas',
        latitude: 37.5,
        longitude: -77.5,
        days_since_planting: 70,
        growth_stage: 'vegetative',
        heat_index_approx: 45.0,
      };

      service.predict(mockRequest).subscribe((response) => {
        expect(response).toEqual(mockMLResponse);
      });

      const req = httpMock.expectOne('https://dcdjntjzcqmhaxpcualb.supabase.co/functions/v1/crop-heat-risk');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(mockRequest);
      expect(req.request.headers.get('Content-Type')).toBe('application/json');
      expect(req.request.headers.get('Authorization')).toContain('Bearer');
      req.flush(mockEdgeFunctionResponse);
    });

    it('should handle Edge Function errors gracefully', () => {
      const mockRequest: CropHeatRiskRequest = {
        hour: 14,
        day_of_year: 210,
        month: 7,
        temperature_c: 35.0,
        relative_humidity_percent: 70.0,
        ghi_w_m2: 850.0,
        dni_w_m2: 900.0,
        dhi_w_m2: 150.0,
        location: 'Arkansas',
        latitude: 37.5,
        longitude: -77.5,
        days_since_planting: 70,
        growth_stage: 'vegetative',
        heat_index_approx: 45.0,
      };

      const errorResponse = {
        success: false,
        error: 'ML API request failed',
      };

      service.predict(mockRequest).subscribe({
        next: () => fail('should have failed'),
        error: (error) => {
          expect(error.message).toBe('ML API request failed');
        },
      });

      const req = httpMock.expectOne('https://dcdjntjzcqmhaxpcualb.supabase.co/functions/v1/crop-heat-risk');
      req.flush(errorResponse, { status: 503, statusText: 'Service Unavailable' });
    });

    it('should handle network errors gracefully', () => {
      const mockRequest: CropHeatRiskRequest = {
        hour: 14,
        day_of_year: 210,
        month: 7,
        temperature_c: 35.0,
        relative_humidity_percent: 70.0,
        ghi_w_m2: 850.0,
        dni_w_m2: 900.0,
        dhi_w_m2: 150.0,
        location: 'Arkansas',
        latitude: 37.5,
        longitude: -77.5,
        days_since_planting: 70,
        growth_stage: 'vegetative',
        heat_index_approx: 45.0,
      };

      service.predict(mockRequest).subscribe({
        next: () => fail('should have failed'),
        error: (error) => {
          expect(error.message).toBe('Heat-risk prediction is currently unavailable.');
        },
      });

      const req = httpMock.expectOne('https://dcdjntjzcqmhaxpcualb.supabase.co/functions/v1/crop-heat-risk');
      req.flush('Network Error', { status: 0, statusText: 'Unknown Error' });
    });

    it('should handle Edge Function success=false responses', () => {
      const mockRequest: CropHeatRiskRequest = {
        hour: 14,
        day_of_year: 210,
        month: 7,
        temperature_c: 35.0,
        relative_humidity_percent: 70.0,
        ghi_w_m2: 850.0,
        dni_w_m2: 900.0,
        dhi_w_m2: 150.0,
        location: 'Arkansas',
        latitude: 37.5,
        longitude: -77.5,
        days_since_planting: 70,
        growth_stage: 'vegetative',
        heat_index_approx: 45.0,
      };

      const errorResponse = {
        success: false,
        error: 'Invalid growth stage',
      };

      service.predict(mockRequest).subscribe({
        next: () => fail('should have failed'),
        error: (error) => {
          expect(error.message).toBe('Invalid growth stage');
        },
      });

      const req = httpMock.expectOne('https://dcdjntjzcqmhaxpcualb.supabase.co/functions/v1/crop-heat-risk');
      req.flush(errorResponse, { status: 400, statusText: 'Bad Request' });
    });
  });

  describe('buildRequestFromCropData', () => {
    it('should build valid request with all data', () => {
      const request = service.buildRequestFromCropData(
        mockCrop,
        mockZone,
        mockFarm,
        mockWeather
      );

      expect(request).not.toBeNull();
      expect(request?.growth_stage).toBe('vegetative');
      expect(request?.location).toBe('Arkansas');
      expect(request?.latitude).toBe(37.5);
      expect(request?.longitude).toBe(-77.5);
      expect(request?.temperature_c).toBe(35.0);
      expect(request?.relative_humidity_percent).toBe(70.0);
      expect(request?.days_since_planting).toBeGreaterThan(0);
    });

    it('should return null when planting date is missing', () => {
      const cropWithoutDate: Crop = { ...mockCrop, plantingDate: undefined };
      const request = service.buildRequestFromCropData(
        cropWithoutDate,
        mockZone,
        mockFarm,
        mockWeather
      );

      expect(request).toBeNull();
    });

    it('should return null for invalid growth stage', () => {
      const cropWithInvalidStage: Crop = { ...mockCrop, growthStage: 'invalid' };
      const request = service.buildRequestFromCropData(
        cropWithInvalidStage,
        mockZone,
        mockFarm,
        mockWeather
      );

      expect(request).toBeNull();
    });

    it('should use default weather values when weather data is missing', () => {
      const request = service.buildRequestFromCropData(mockCrop, mockZone, mockFarm, undefined);

      expect(request).not.toBeNull();
      expect(request?.temperature_c).toBe(25.0); // default temperature
      expect(request?.relative_humidity_percent).toBe(60.0); // default humidity
    });

    it('should use zone coordinates when available', () => {
      const request = service.buildRequestFromCropData(mockCrop, mockZone, mockFarm, mockWeather);

      expect(request?.latitude).toBe(37.5);
      expect(request?.longitude).toBe(-77.5);
    });

    it('should fall back to farm coordinates when zone coordinates are missing', () => {
      const zoneWithoutCoords: FarmZone = { ...mockZone, latitude: undefined, longitude: undefined };
      const request = service.buildRequestFromCropData(mockCrop, zoneWithoutCoords, mockFarm, mockWeather);

      expect(request?.latitude).toBe(37.5);
      expect(request?.longitude).toBe(-77.5);
    });

    it('should calculate days since planting correctly', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 30);
      const cropWithPastDate: Crop = {
        ...mockCrop,
        plantingDate: pastDate.toISOString().split('T')[0],
      };

      const request = service.buildRequestFromCropData(
        cropWithPastDate,
        mockZone,
        mockFarm,
        mockWeather
      );

      expect(request?.days_since_planting).toBe(30);
    });

    it('should accept all valid growth stages', () => {
      const validStages: Array<'maturity' | 'planted' | 'reproductive' | 'vegetative'> = [
        'maturity',
        'planted',
        'reproductive',
        'vegetative',
      ];

      validStages.forEach((stage) => {
        const cropWithStage: Crop = { ...mockCrop, growthStage: stage };
        const request = service.buildRequestFromCropData(
          cropWithStage,
          mockZone,
          mockFarm,
          mockWeather
        );

        expect(request).not.toBeNull();
        expect(request?.growth_stage).toBe(stage);
      });
    });
  });
});