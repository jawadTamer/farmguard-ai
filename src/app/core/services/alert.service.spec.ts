import { TestBed } from '@angular/core/testing';

import { AlertService } from './alert.service';
import { SupabaseService } from './supabase.service';
import { CropHeatRiskResponse } from '../models/crop-heat-risk.model';

describe('AlertService', () => {
  let service: AlertService;
  let mockSupabaseService: any;

  const mockMLResponse: CropHeatRiskResponse = {
    predictions: [
      {
        heat_risk_class: 'High',
        probabilities: {
          Critical: 0.00013,
          High: 0.85,
          Low: 0.1,
          Moderate: 0.04987,
        },
      },
    ],
    status: 'success',
  };

  const mockLowRiskResponse: CropHeatRiskResponse = {
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

  const mockModerateRiskResponse: CropHeatRiskResponse = {
    predictions: [
      {
        heat_risk_class: 'Moderate',
        probabilities: {
          Critical: 0.001,
          High: 0.1,
          Low: 0.3,
          Moderate: 0.599,
        },
      },
    ],
    status: 'success',
  };

  const mockCriticalRiskResponse: CropHeatRiskResponse = {
    predictions: [
      {
        heat_risk_class: 'Critical',
        probabilities: {
          Critical: 0.95,
          High: 0.04,
          Low: 0.005,
          Moderate: 0.005,
        },
      },
    ],
    status: 'success',
  };

  beforeEach(() => {
    mockSupabaseService = {
      client: {
        from: jasmine.createSpy('from').and.returnValue({
          insert: jasmine.createSpy('insert').and.returnValue(Promise.resolve({ error: null }))
        })
      }
    };

    TestBed.configureTestingModule({
      providers: [
        AlertService,
        { provide: SupabaseService, useValue: mockSupabaseService }
      ]
    });
    service = TestBed.inject(AlertService);

    // Mock hasRecentCropHeatAlert to return false by default
    spyOn(service, 'hasRecentCropHeatAlert').and.returnValue(Promise.resolve(false));
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('createCropHeatRiskAlert', () => {
    it('should create alert for High risk prediction', async () => {
      const alert = await service.createCropHeatRiskAlert(
        'farm-1',
        'zone-1',
        'crop-1',
        mockMLResponse,
        35.0,
        70.0,
        'vegetative',
        'Field A',
        'Wheat'
      );

      expect(alert).not.toBeNull();
      expect(alert?.severity).toBe('warning');
      expect(alert?.type).toBe('heat-stress');
      expect(alert?.title).toContain('High crop heat risk');
      expect(alert?.message).toContain('85.0%');
      expect(alert?.message).toContain('35°C');
      expect(alert?.message).toContain('70%');
      expect(alert?.message).toContain('vegetative');
    });

    it('should create alert for Critical risk prediction', async () => {
      const alert = await service.createCropHeatRiskAlert(
        'farm-1',
        'zone-1',
        'crop-1',
        mockCriticalRiskResponse,
        40.0,
        65.0,
        'reproductive',
        'Field B',
        'Corn'
      );

      expect(alert).not.toBeNull();
      expect(alert?.severity).toBe('critical');
      expect(alert?.type).toBe('heat-stress');
      expect(alert?.title).toContain('Critical crop heat risk');
      expect(alert?.message).toContain('95.0%');
    });

    it('should create alert for Moderate risk prediction', async () => {
      const alert = await service.createCropHeatRiskAlert(
        'farm-1',
        'zone-1',
        'crop-1',
        mockModerateRiskResponse,
        32.0,
        75.0,
        'maturity',
        'Field C',
        'Soybeans'
      );

      expect(alert).not.toBeNull();
      expect(alert?.severity).toBe('warning');
      expect(alert?.type).toBe('heat-stress');
      expect(alert?.title).toContain('Moderate crop heat risk');
      expect(alert?.message).toContain('59.9%');
    });

    it('should NOT create alert for Low risk prediction', async () => {
      const alert = await service.createCropHeatRiskAlert(
        'farm-1',
        'zone-1',
        'crop-1',
        mockLowRiskResponse,
        28.0,
        60.0,
        'planted',
        'Field D',
        'Rice'
      );

      expect(alert).toBeNull();
    });

    it('should return null for empty predictions', async () => {
      const emptyResponse: CropHeatRiskResponse = {
        predictions: [],
        status: 'success',
      };

      const alert = await service.createCropHeatRiskAlert(
        'farm-1',
        'zone-1',
        'crop-1',
        emptyResponse,
        30.0,
        65.0,
        'vegetative'
      );

      expect(alert).toBeNull();
    });

    it('should return null for null predictions', async () => {
      const nullResponse: CropHeatRiskResponse = {
        predictions: [] as any,
        status: 'success',
      };

      const alert = await service.createCropHeatRiskAlert(
        'farm-1',
        'zone-1',
        'crop-1',
        nullResponse,
        30.0,
        65.0,
        'vegetative'
      );

      expect(alert).toBeNull();
    });

    it('should not create alert if recent alert exists', async () => {
      // Reset the spy to return true for this test
      (service.hasRecentCropHeatAlert as jasmine.Spy).and.returnValue(Promise.resolve(true));

      const alert = await service.createCropHeatRiskAlert(
        'farm-1',
        'zone-1',
        'crop-1',
        mockMLResponse,
        35.0,
        70.0,
        'vegetative'
      );

      expect(alert).toBeNull();

      // Reset the spy back to false for other tests
      (service.hasRecentCropHeatAlert as jasmine.Spy).and.returnValue(Promise.resolve(false));
    });

    it('should handle missing zoneName and cropType gracefully', async () => {
      const alert = await service.createCropHeatRiskAlert(
        'farm-1',
        'zone-1',
        'crop-1',
        mockMLResponse,
        35.0,
        70.0,
        'vegetative'
      );

      expect(alert).not.toBeNull();
      expect(alert?.message).toContain('Crop in ');
    });
  });
});
