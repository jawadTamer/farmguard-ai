import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  ValidatorFn,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { Router } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { CropService } from '../../../core/services/crop.service';
import { ZoneService } from '../../../core/services/zone.service';
import { FarmZone } from '../../../core/models/farm-zone.model';

const VALID_GROWTH_STAGES = ['maturity', 'planted', 'reproductive', 'vegetative'];

function growthStageValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (!value) {
      return null;
    }
    return VALID_GROWTH_STAGES.includes(value)
      ? null
      : { invalidGrowthStage: true };
  };
}

@Component({
  selector: 'app-crop-create',
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
  ],
  templateUrl: './crop-create.component.html',
  styleUrl: './crop-create.component.css',
})
export class CropCreateComponent implements OnInit {
  cropForm: FormGroup;
  zones: FarmZone[] = [];
  isSubmitting = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private cropService: CropService,
    private zoneService: ZoneService,
    private router: Router,
  ) {
    this.cropForm = this.fb.group({
      zoneId: ['', [Validators.required]],
      cropType: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(80),
        ],
      ],
      variety: ['', [Validators.maxLength(80)]],
      growthStage: ['vegetative', [Validators.required, growthStageValidator()]],
      plantingDate: [''],
    });
  }

  ngOnInit(): void {
    void this.loadZones();
  }

  async loadZones(): Promise<void> {
    try {
      this.zones = await this.zoneService.getAllZones();

      if (!this.zones.length) {
        this.errorMessage = 'No zones are available yet. Create a zone first.';
        return;
      }

      const currentValue = this.cropForm.get('zoneId')?.value;
      if (!currentValue) {
        this.cropForm.patchValue({ zoneId: this.zones[0].id });
      }
    } catch (error) {
      console.error('Failed to load zones:', error);
      this.errorMessage = 'Unable to load zones information.';
    }
  }

  get cropType() {
    return this.cropForm.get('cropType');
  }

  get variety() {
    return this.cropForm.get('variety');
  }

  get growthStage() {
    return this.cropForm.get('growthStage');
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = '';

    if (this.cropForm.invalid) {
      this.cropForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    try {
      const formValue = this.cropForm.getRawValue();

      await this.cropService.addCrop(formValue.zoneId, {
        cropType: formValue.cropType.trim(),
        variety: formValue.variety?.trim() || undefined,
        growthStage: formValue.growthStage,
        plantingDate: formValue.plantingDate || undefined,
      });

      await this.router.navigate(['/crops']);
    } catch (error) {
      console.error('Failed to create crop:', error);
      this.errorMessage = 'Failed to create the crop. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  cancel(): void {
    this.router.navigate(['/crops']);
  }
}
