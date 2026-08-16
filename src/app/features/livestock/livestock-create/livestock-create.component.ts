import { Component, OnInit } from '@angular/core';
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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { LivestockService } from '../../../core/services/livestock.service';
import { ZoneService } from '../../../core/services/zone.service';
import { FarmZone } from '../../../core/models/farm-zone.model';

@Component({
  selector: 'app-livestock-create',
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
  templateUrl: './livestock-create.component.html',
  styleUrl: './livestock-create.component.css',
})
export class LivestockCreateComponent implements OnInit {
  livestockForm: FormGroup;
  zones: FarmZone[] = [];
  isSubmitting = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private livestockService: LivestockService,
    private zoneService: ZoneService,
    private router: Router,
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

      if (!this.livestockForm.get('zoneId')?.value) {
        this.livestockForm.patchValue({ zoneId: this.zones[0].id });
      }
    } catch (error) {
      console.error('Failed to load zones:', error);
      this.errorMessage = 'Unable to load zones information.';
    }
  }

  get livestockType() {
    return this.livestockForm.get('livestockType');
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

      await this.livestockService.addLivestock(formValue.zoneId, {
        livestockType: formValue.livestockType.trim(),
        breed: formValue.breed?.trim() || undefined,
        count: Number(formValue.count),
      });

      await this.router.navigate(['/livestock']);
    } catch (error) {
      console.error('Failed to create livestock record:', error);
      this.errorMessage =
        'Failed to create the livestock record. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  cancel(): void {
    this.router.navigate(['/livestock']);
  }
}
