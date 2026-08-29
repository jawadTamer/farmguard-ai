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
import { ActivatedRoute, Router } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { CropService } from '../../../core/services/crop.service';
import { ZoneService } from '../../../core/services/zone.service';
import { Crop } from '../../../core/models/crop.model';
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
  selector: 'app-crop-edit',
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
  templateUrl: './crop-edit.component.html',
  styleUrl: './crop-edit.component.css',
})
export class CropEditComponent implements OnInit {
  cropForm: FormGroup;
  cropId = '';
  crop?: Crop;
  zones: FarmZone[] = [];
  isLoading = true;
  isSubmitting = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private cropService: CropService,
    private zoneService: ZoneService,
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
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.errorMessage = 'Crop record was not found.';
      this.isLoading = false;
      return;
    }
    this.cropId = id;
    void this.loadData();
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const [zones, crop] = await Promise.all([
        this.zoneService.getAllZones(),
        this.cropService.getCropById(this.cropId),
      ]);

      this.zones = zones;
      this.crop = crop;

      if (!crop) {
        this.errorMessage = 'The crop record could not be found.';
        this.isLoading = false;
        return;
      }

      this.cropForm.patchValue({
        zoneId: crop.zoneId,
        cropType: crop.cropType,
        variety: crop.variety ?? '',
        growthStage: crop.growthStage,
        plantingDate: crop.plantingDate ?? '',
      });
    } catch (error) {
      console.error('Failed to load crop record:', error);
      this.errorMessage = 'Unable to load this crop record.';
    } finally {
      this.isLoading = false;
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

      await this.cropService.updateCrop(this.cropId, {
        zoneId: formValue.zoneId,
        cropType: formValue.cropType.trim(),
        variety: formValue.variety?.trim() || undefined,
        growthStage: formValue.growthStage,
        plantingDate: formValue.plantingDate || undefined,
      });

      await this.router.navigate(['/crops', this.cropId]);
    } catch (error) {
      console.error('Failed to update crop:', error);
      this.errorMessage =
        'Failed to update this crop record. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  cancel(): void {
    if (this.cropId) {
      this.router.navigate(['/crops', this.cropId]);
      return;
    }
    this.router.navigate(['/crops']);
  }
}
