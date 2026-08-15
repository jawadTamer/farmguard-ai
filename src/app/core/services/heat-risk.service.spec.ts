import { TestBed } from '@angular/core/testing';

import { HeatRiskService } from './heat-risk.service';

describe('HeatRiskService', () => {
  let service: HeatRiskService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HeatRiskService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
