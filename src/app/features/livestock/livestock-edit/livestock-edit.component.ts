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

import { LivestockService } from '../../../core/services/livestock.service';
import { ZoneService } from '../../../core/services/zone.service';
import { Livestock } from '../../../core/models/livestock.model';
import { FarmZone } from '../../../core/models/farm-zone.model';

@Component({
  selector: 'app-livestock-edit',
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
  templateUrl: './livestock-edit.component.html',
  styleUrl: './livestock-edit.component.css',
})
export class LivestockEditComponent implements OnInit {
  livestockForm: FormGroup;
  livestockId = '';
  livestock?: Livestock;
  zones: FarmZone[] = [];
  isLoading = true;
  isSubmitting = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private livestockService: LivestockService,
    private zoneService: ZoneService,
  ) {
    this.livestockForm = this.fb.group({
      zoneId: ['', [Validators.required]],
      livestockType: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(80),
        ],
      ],
      breed: ['', [Validators.maxLength(80)]],
      count: [1, [Validators.required, Validators.min(1)]],
      sex: ['', [Validators.required]],
      physiologicalStage: ['', [Validators.maxLength(80)]],
      ageYears: [null, [Validators.min(0), Validators.max(30)]],
      weightKg: [null, [Validators.min(1), Validators.max(5000)]],
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.errorMessage = 'Livestock record was not found.';
      this.isLoading = false;
      return;
    }

    this.livestockId = id;
    void this.loadData();
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const [zones, livestock] = await Promise.all([
        this.zoneService.getAllZones(),
        this.livestockService.getLivestockById(this.livestockId),
      ]);

      this.zones = zones;
      this.livestock = livestock;

      if (!livestock) {
        this.errorMessage = 'The livestock record could not be found.';
        this.isLoading = false;
        return;
      }

      this.livestockForm.patchValue({
        zoneId: livestock.zoneId,
        livestockType: livestock.livestockType,
        breed: livestock.breed ?? '',
        count: livestock.count ?? 1,
        sex: livestock.sex ?? '',
        physiologicalStage: livestock.physiologicalStage ?? '',
        ageYears: livestock.ageYears ?? null,
        weightKg: livestock.weightKg ?? null,
      });
    } catch (error) {
      console.error('Failed to load livestock record:', error);
      this.errorMessage = 'Unable to load this livestock record.';
    } finally {
      this.isLoading = false;
    }
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = '';

    if (this.livestockForm.invalid) {
      this.livestockForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    try {
      const formValue = this.livestockForm.getRawValue();

      await this.livestockService.updateLivestock(this.livestockId, {
        zoneId: formValue.zoneId,
        livestockType: formValue.livestockType.trim(),
        breed: formValue.breed?.trim() || undefined,
        count: Number(formValue.count),
        sex: formValue.sex as 'male' | 'female' || undefined,
        physiologicalStage: formValue.physiologicalStage?.trim() || undefined,
        ageYears: formValue.ageYears ? Number(formValue.ageYears) : undefined,
        weightKg: formValue.weightKg ? Number(formValue.weightKg) : undefined,
      });

      await this.router.navigate(['/livestock', this.livestockId]);
    } catch (error) {
      console.error('Failed to update livestock:', error);
      this.errorMessage =
        'Failed to update this livestock record. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  cancel(): void {
    if (this.livestockId) {
      this.router.navigate(['/livestock', this.livestockId]);
      return;
    }

    this.router.navigate(['/livestock']);
  }
}
