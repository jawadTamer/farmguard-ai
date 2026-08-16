import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ZoneService } from '../../../core/services/zone.service';
import { FarmService } from '../../../core/services/farm.service';
import { Farm } from '../../../core/models/farm.model';

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
    MatProgressSpinnerModule
  ],

  templateUrl: './zone-create.component.html',
  styleUrl: './zone-create.component.css'
})
export class ZoneCreateComponent implements OnInit {

  zoneForm: FormGroup;

  farmId = '';

  farm?: Farm;

  isSubmitting = false;

  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private zoneService: ZoneService,
    private farmService: FarmService
  ) {

    this.zoneForm = this.fb.group({

      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100)
        ]
      ],

      description: [
        '',
        Validators.maxLength(500)
      ],

      area: [
        null,
        [
          Validators.min(0)
        ]
      ],

      latitude: [
        null,
        [
          Validators.min(-90),
          Validators.max(90)
        ]
      ],

      longitude: [
        null,
        [
          Validators.min(-180),
          Validators.max(180)
        ]
      ]

    });

  }

  // =====================================================
  // Init
  // =====================================================

  ngOnInit(): void {

    const farmId =
      this.route.snapshot.paramMap.get('farmId');

    if (!farmId) {

      this.errorMessage =
        'Farm ID is missing.';

      return;
    }

    this.farmId = farmId;

    this.loadFarm();

  }

  // =====================================================
  // Load Farm
  // =====================================================

  async loadFarm(): Promise<void> {

    try {

      this.farm =
        await this.farmService.getFarmById(
          this.farmId
        );

      if (!this.farm) {

        this.errorMessage =
          'Farm not found.';

      }

    } catch (error) {

      console.error(
        'Failed to load farm:',
        error
      );

      this.errorMessage =
        'Unable to load farm information.';

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

      const formValue =
        this.zoneForm.getRawValue();

      const zone =
        await this.zoneService.addZone(
          this.farmId,
          {
            name: formValue.name.trim(),

            description:
              formValue.description?.trim() || undefined,

            area:
              formValue.area !== null
                ? Number(formValue.area)
                : undefined,

            latitude:
              formValue.latitude !== null
                ? Number(formValue.latitude)
                : undefined,

            longitude:
              formValue.longitude !== null
                ? Number(formValue.longitude)
                : undefined
          }
        );

      // Go directly to the newly created zone.
      await this.router.navigate([
        '/farms',
        this.farmId,
        'zones',
        zone.id
      ]);

    } catch (error) {

      console.error(
        'Failed to create zone:',
        error
      );

      this.errorMessage =
        'Failed to create the zone. Please try again.';

      this.isSubmitting = false;

    }

  }

  // =====================================================
  // Cancel
  // =====================================================

  cancel(): void {

    this.router.navigate([
      '/farms',
      this.farmId,
      'zones'
    ]);

  }

}