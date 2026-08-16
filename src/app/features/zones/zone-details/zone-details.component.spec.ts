import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { convertToParamMap } from '@angular/router';

import { ZoneDetailsComponent } from './zone-details.component';
import { ZoneService } from '../../../core/services/zone.service';
import { FarmService } from '../../../core/services/farm.service';
import { FarmZone } from '../../../core/models/farm-zone.model';

describe('ZoneDetailsComponent', () => {
  let component: ZoneDetailsComponent;
  let fixture: ComponentFixture<ZoneDetailsComponent>;

  const mockZone: FarmZone = {
    id: 'zone-123',
    farmId: 'farm-456',
    name: 'North Plot',
    description: 'Corn field',
    area: 40,
    latitude: 10.5,
    longitude: 20.5,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZoneDetailsComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ zoneId: 'zone-123' }),
            },
          },
        },
        {
          provide: ZoneService,
          useValue: {
            getZoneById: jasmine
              .createSpy('getZoneById')
              .and.resolveTo(mockZone),
          },
        },
        {
          provide: FarmService,
          useValue: {
            getFarmById: jasmine.createSpy('getFarmById').and.resolveTo({
              id: 'farm-456',
              name: 'Demo Farm',
              location: 'Nairobi',
              size: 100,
              description: 'Demo description',
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ZoneDetailsComponent);
    component = fixture.componentInstance;
  });

  it('loads a zone when only zoneId is present in the route', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.errorMessage).toBe('');
    expect(component.zone).toEqual(mockZone);
    expect(component.farmId).toBe('farm-456');
  });
});
