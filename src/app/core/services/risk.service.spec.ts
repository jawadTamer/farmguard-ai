import { TestBed } from '@angular/core/testing';

import { RiskService } from './risk.service';
import { SupabaseService } from './supabase.service';
import { CropHeatRiskResponse } from '../models/crop-heat-risk.model';

describe('RiskService', () => {
  let service: RiskService;
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
        RiskService,
        { provide: SupabaseService, useValue: mockSupabaseService }
      ]
    });
    service = TestBed.inject(RiskService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('saveCropHeatRiskAssessment', () => {
    it('should save High risk assessment to database', async () => {
      await service.saveCropHeatRiskAssessment(
        'farm-1',
        'zone-1',
        'crop-1',
        mockMLResponse,
        35.0,
        70.0,
        'vegetative'
      );

      expect(mockSupabaseService.client.from).toHaveBeenCalledWith('risk_assessments');
      const insertCall = mockSupabaseService.client.from().insert.calls.mostRecent().args[0];
      expect(insertCall.farm_id).toBe('farm-1');
      expect(insertCall.zone_id).toBe('zone-1');
      expect(insertCall.crop_id).toBe('crop-1');
      expect(insertCall.risk_type).toBe('heat');
      expect(insertCall.risk_level).toBe('high');
      expect(insertCall.risk_score).toBe(85);
      expect(insertCall.temperature).toBe(35.0);
      expect(insertCall.confidence).toBe(0.85);
      expect(insertCall.metadata.source).toBe('ml_model');
      expect(insertCall.metadata.growth_stage).toBe('vegetative');
      expect(insertCall.metadata.humidity).toBe(70.0);
    });

    it('should save Critical risk assessment to database', async () => {
      await service.saveCropHeatRiskAssessment(
        'farm-1',
        'zone-1',
        'crop-1',
        mockCriticalRiskResponse,
        40.0,
        65.0,
        'reproductive'
      );

      const insertCall = mockSupabaseService.client.from().insert.calls.mostRecent().args[0];
      expect(insertCall.risk_level).toBe('critical');
      expect(insertCall.risk_score).toBe(95);
      expect(insertCall.temperature).toBe(40.0);
      expect(insertCall.confidence).toBe(0.95);
    });

    it('should save Moderate risk assessment to database', async () => {
      await service.saveCropHeatRiskAssessment(
        'farm-1',
        'zone-1',
        'crop-1',
        mockModerateRiskResponse,
        32.0,
        75.0,
        'maturity'
      );

      const insertCall = mockSupabaseService.client.from().insert.calls.mostRecent().args[0];
      expect(insertCall.risk_level).toBe('moderate');
      expect(insertCall.risk_score).toBe(60);
      expect(insertCall.temperature).toBe(32.0);
      expect(insertCall.confidence).toBe(0.599);
    });

    it('should save Low risk assessment to database', async () => {
      await service.saveCropHeatRiskAssessment(
        'farm-1',
        'zone-1',
        'crop-1',
        mockLowRiskResponse,
        28.0,
        60.0,
        'planted'
      );

      const insertCall = mockSupabaseService.client.from().insert.calls.mostRecent().args[0];
      expect(insertCall.risk_level).toBe('low');
      expect(insertCall.risk_score).toBe(100);
      expect(insertCall.temperature).toBe(28.0);
      expect(insertCall.confidence).toBe(0.9988);
    });

    it('should not save assessment for empty predictions', async () => {
      const emptyResponse: CropHeatRiskResponse = {
        predictions: [],
        status: 'success',
      };

      await service.saveCropHeatRiskAssessment(
        'farm-1',
        'zone-1',
        'crop-1',
        emptyResponse,
        30.0,
        65.0,
        'vegetative'
      );

      expect(mockSupabaseService.client.from).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockSupabaseService.client.from.and.returnValue({
        insert: jasmine.createSpy('insert').and.returnValue(Promise.resolve({ error: new Error('Database error') }))
      });

      await expectAsync(service.saveCropHeatRiskAssessment(
        'farm-1',
        'zone-1',
        'crop-1',
        mockMLResponse,
        35.0,
        70.0,
        'vegetative'
      )).toBeResolved();
    });

    it('should handle undefined zoneId', async () => {
      await service.saveCropHeatRiskAssessment(
        'farm-1',
        undefined,
        'crop-1',
        mockMLResponse,
        35.0,
        70.0,
        'vegetative'
      );

      const insertCall = mockSupabaseService.client.from().insert.calls.mostRecent().args[0];
      expect(insertCall.zone_id).toBeNull();
    });

    it('should generate appropriate reason for Critical risk', async () => {
      await service.saveCropHeatRiskAssessment(
        'farm-1',
        'zone-1',
        'crop-1',
        mockCriticalRiskResponse,
        40.0,
        65.0,
        'reproductive'
      );

      const insertCall = mockSupabaseService.client.from().insert.calls.mostRecent().args[0];
      expect(insertCall.reason).toContain('CRITICAL heat risk');
      expect(insertCall.reason).toContain('95.0%');
      expect(insertCall.reason).toContain('Immediate action required');
    });

    it('should generate appropriate reason for High risk', async () => {
      await service.saveCropHeatRiskAssessment(
        'farm-1',
        'zone-1',
        'crop-1',
        mockMLResponse,
        35.0,
        70.0,
        'vegetative'
      );

      const insertCall = mockSupabaseService.client.from().insert.calls.mostRecent().args[0];
      expect(insertCall.reason).toContain('HIGH heat risk');
      expect(insertCall.reason).toContain('85.0%');
      expect(insertCall.reason).toContain('Take preventive measures');
    });

    it('should generate appropriate reason for Moderate risk', async () => {
      await service.saveCropHeatRiskAssessment(
        'farm-1',
        'zone-1',
        'crop-1',
        mockModerateRiskResponse,
        32.0,
        75.0,
        'maturity'
      );

      const insertCall = mockSupabaseService.client.from().insert.calls.mostRecent().args[0];
      expect(insertCall.reason).toContain('MODERATE heat risk');
      expect(insertCall.reason).toContain('59.9%');
      expect(insertCall.reason).toContain('Monitor conditions closely');
    });

    it('should generate appropriate reason for Low risk', async () => {
      await service.saveCropHeatRiskAssessment(
        'farm-1',
        'zone-1',
        'crop-1',
        mockLowRiskResponse,
        28.0,
        60.0,
        'planted'
      );

      const insertCall = mockSupabaseService.client.from().insert.calls.mostRecent().args[0];
      expect(insertCall.reason).toContain('LOW heat risk');
      expect(insertCall.reason).toContain('99.9%');
      expect(insertCall.reason).toContain('Conditions are favorable');
    });
  });
});
