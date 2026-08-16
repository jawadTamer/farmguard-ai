import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { FarmService } from '../../../core/services/farm.service';
import { LocationPickerComponent } from '../../../shared/components/location-picker/location-picker.component';

@Component({
  selector: 'app-farm-create',
  standalone: true,

  imports: [
    CommonModule,
    ReactiveFormsModule,

    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    LocationPickerComponent,
  ],

  templateUrl: './farm-create.component.html',
  styleUrl: './farm-create.component.css',
})
export class FarmCreateComponent {
  farmForm: FormGroup;

  isSubmitting = false;

  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private farmService: FarmService,
    private router: Router,
  ) {
    this.farmForm = this.fb.group({
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
        ],
      ],

      location: ['', [Validators.required, Validators.minLength(2)]],

      description: [''],

      area: [null, [Validators.required, Validators.min(0.1)]],

      areaUnit: ['acre', Validators.required],

      status: ['active', Validators.required],

      latitude: [null, [Validators.min(-90), Validators.max(90)]],

      longitude: [null, [Validators.min(-180), Validators.max(180)]],
    });
  }

  // =====================================================
  // Getters
  // =====================================================

  get name() {
    return this.farmForm.get('name');
  }

  get location() {
    return this.farmForm.get('location');
  }

  get area() {
    return this.farmForm.get('area');
  }

  get latitude() {
    return this.farmForm.get('latitude');
  }

  get longitude() {
    return this.farmForm.get('longitude');
  }

  // =====================================================
  // Location Picker
  // =====================================================

  onLocationSelected(event: { latitude: number; longitude: number }): void {
    this.farmForm.patchValue({
      latitude: event.latitude,
      longitude: event.longitude,
    });
  }

  // =====================================================
  // Submit
  // =====================================================

  async onSubmit(): Promise<void> {
    this.errorMessage = '';

    if (this.farmForm.invalid) {
      this.farmForm.markAllAsTouched();

      return;
    }

    this.isSubmitting = true;

    try {
      const formValue = this.farmForm.getRawValue();

      const farm = await this.farmService.addFarm({
        name: formValue.name.trim(),

        location: formValue.location?.trim(),
        description: formValue.description?.trim(),

        area: formValue.area !== null ? Number(formValue.area) : undefined,

        areaUnit: formValue.areaUnit,

        latitude:
          formValue.latitude !== null ? Number(formValue.latitude) : undefined,

        longitude:
          formValue.longitude !== null
            ? Number(formValue.longitude)
            : undefined,

        status: formValue.status === 'inactive' ? 'inactive' : 'active',
      });

      console.log('Farm created successfully:', farm);

      // Navigate only AFTER Supabase INSERT succeeds
      await this.router.navigate(['/farms']);
    } catch (error: any) {
      console.error('Failed to create farm:', error);

      this.errorMessage =
        error?.message ||
        'Something went wrong while creating the farm. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  // =====================================================
  // Cancel
  // =====================================================

  cancel(): void {
    this.router.navigate(['/farms']);
  }

  // =====================================================
  // Reset
  // =====================================================

  resetForm(): void {
    this.farmForm.reset({
      areaUnit: 'acre',

      status: 'active',
    });

    this.errorMessage = '';
  }
}
