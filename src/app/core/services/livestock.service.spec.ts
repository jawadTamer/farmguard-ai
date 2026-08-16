import { TestBed } from '@angular/core/testing';

import { LivestockService } from './livestock.service';
import { SupabaseService } from './supabase.service';

describe('LivestockService', () => {
  let service: LivestockService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LivestockService, SupabaseService],
    });
    service = TestBed.inject(LivestockService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should expose the CRUD API expected by the app', () => {
    expect(service.getAllLivestock).toEqual(jasmine.any(Function));
    expect(service.getLivestockByZone).toEqual(jasmine.any(Function));
    expect(service.getLivestockById).toEqual(jasmine.any(Function));
    expect(service.addLivestock).toEqual(jasmine.any(Function));
    expect(service.updateLivestock).toEqual(jasmine.any(Function));
    expect(service.deleteLivestock).toEqual(jasmine.any(Function));
  });
});
