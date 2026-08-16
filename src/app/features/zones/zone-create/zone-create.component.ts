import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { ZoneService } from '../../../core/services/zone.service';
import { FarmService } from '../../../core/services/farm.service';
import { Farm } from '../../../core/models/farm.model';
import { LocationPickerComponent } from '../../../shared/components/location-picker/location-picker.component';

@Component({
  selector: 'app-zone-create',
  standalone: true,

  imports: [
    CommonModule,
    ReactiveFormsModule,

    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    LocationPickerComponent,
  ],

  templateUrl: './zone-create.component.html',
  styleUrl: './zone-create.component.css',
})
export class ZoneCreateComponent implements OnInit {
  zoneForm: FormGroup;

  farmId = '';

  farms: Farm[] = [];

  farm?: Farm;

  isSubmitting = false;

  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private zoneService: ZoneService,
    private farmService: FarmService,
  ) {
    this.zoneForm = this.fb.group({
      farmId: ['', [Validators.required]],

      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
        ],
      ],

      description: ['', Validators.maxLength(500)],

      area: [null, [Validators.min(0)]],

      latitude: [null, [Validators.min(-90), Validators.max(90)]],

      longitude: [null, [Validators.min(-180), Validators.max(180)]],
    });
  }

  // =====================================================
  // Init
  // =====================================================

  ngOnInit(): void {
    const farmId = this.route.snapshot.paramMap.get('farmId');

    if (farmId) {
      this.farmId = farmId;
    }

    void this.loadFarms();
  }

  // =====================================================
  // Load Farms
  // =====================================================

  async loadFarms(): Promise<void> {
    try {
      this.farms = await this.farmService.getFarms();

      if (!this.farms.length) {
        this.errorMessage = 'No farms are available yet. Create a farm first.';
        return;
      }

      if (!this.farmId) {
        this.farmId = this.farms[0].id;
      }

      const matchedFarm =
        this.farms.find((farm) => farm.id === this.farmId) ?? this.farms[0];
      this.farm = matchedFarm;
      this.farmId = matchedFarm.id;
      this.zoneForm.patchValue({ farmId: this.farmId });
    } catch (error) {
      console.error('Failed to load farms:', error);
      this.errorMessage = 'Unable to load farms information.';
    }
  }

  // =====================================================
  // Getters
  // =====================================================

  get name() {
    return this.zoneForm.get('name');
  }

  get description() {
    return this.zoneForm.get('description');
  }

  get area() {
    return this.zoneForm.get('area');
  }

  get latitude() {
    return this.zoneForm.get('latitude');
  }

  get longitude() {
    return this.zoneForm.get('longitude');
  }

  // =====================================================
  // Farm Selection
  // =====================================================

  onFarmChange(farmId: string): void {
    this.farmId = farmId;
    this.farm = this.farms.find((f) => f.id === farmId);

    if (this.farm?.latitude && this.farm?.longitude) {
      this.zoneForm.patchValue({
        latitude: this.farm.latitude,
        longitude: this.farm.longitude,
      });
    }
  }

  // =====================================================
  // Location Picker
  // =====================================================

  onLocationSelected(event: { latitude: number; longitude: number }): void {
    this.zoneForm.patchValue({
      latitude: event.latitude,
      longitude: event.longitude,
    });
  }

  // =====================================================
  // Submit
  // =====================================================

  async onSubmit(): Promise<void> {
    this.errorMessage = '';

    if (this.zoneForm.invalid) {
      this.zoneForm.markAllAsTouched();

      return;
    }

    this.isSubmitting = true;

    try {
      const formValue = this.zoneForm.getRawValue();

      const selectedFarmId = formValue.farmId;
      this.farmId = selectedFarmId;

      const zone = await this.zoneService.addZone(selectedFarmId, {
        name: formValue.name.trim(),

        description: formValue.description?.trim() || undefined,

        area: formValue.area !== null ? Number(formValue.area) : undefined,

        latitude:
          formValue.latitude !== null ? Number(formValue.latitude) : undefined,

        longitude:
          formValue.longitude !== null
            ? Number(formValue.longitude)
            : undefined,
      });

      await this.router.navigate(['/zones']);
    } catch (error) {
      console.error('Failed to create zone:', error);

      this.errorMessage = 'Failed to create the zone. Please try again.';

      this.isSubmitting = false;
    }
  }

  // =====================================================
  // Cancel
  // =====================================================

  cancel(): void {
    this.router.navigate(['/farms', this.farmId, 'zones']);
  }
}
