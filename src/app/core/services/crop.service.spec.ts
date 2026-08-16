import { TestBed } from '@angular/core/testing';

import { CropService } from './crop.service';
import { SupabaseService } from './supabase.service';

describe('CropService', () => {
  let service: CropService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CropService, SupabaseService],
    });
    service = TestBed.inject(CropService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should expose the CRUD API expected by the app', () => {
    expect(service.getAllCrops).toEqual(jasmine.any(Function));
    expect(service.getCropsByZone).toEqual(jasmine.any(Function));
    expect(service.getCropById).toEqual(jasmine.any(Function));
    expect(service.addCrop).toEqual(jasmine.any(Function));
    expect(service.updateCrop).toEqual(jasmine.any(Function));
    expect(service.deleteCrop).toEqual(jasmine.any(Function));
  });
});
