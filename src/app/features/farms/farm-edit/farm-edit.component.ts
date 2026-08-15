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
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { FarmService } from '../../../core/services/farm.service';
import { Farm } from '../../../core/models/farm.model';

@Component({
  selector: 'app-farm-edit',
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
    MatDividerModule,
    MatProgressSpinnerModule
  ],

  templateUrl: './farm-edit.component.html',
  styleUrl: './farm-edit.component.css'
})
export class FarmEditComponent implements OnInit {

  farmForm!: FormGroup;

  farm: Farm | undefined;

  farmId = '';

  isLoading = true;
  isSaving = false;
  notFound = false;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private farmService: FarmService
  ) {}

  ngOnInit(): void {

    this.createForm();
    this.loadFarm();

  }

  // =====================================================
  // Form
  // =====================================================

  private createForm(): void {

    this.farmForm = this.fb.group({

      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2)
        ]
      ],

      location: [
        '',
        [
          Validators.required
        ]
      ],

      area: [
        null,
        [
          Validators.min(0)
        ]
      ],

      areaUnit: [
        'acre',
        Validators.required
      ],

      status: [
        'active',
        Validators.required
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
  // Load Farm
  // =====================================================

  private loadFarm(): void {

    const id =
      this.route.snapshot.paramMap.get('id');

    if (!id) {

      this.notFound = true;
      this.isLoading = false;

      return;

    }

    this.farmId = id;

    const farm =
      this.farmService.getFarmById(id);

    if (!farm) {

      this.notFound = true;
      this.isLoading = false;

      return;

    }

    this.farm = farm;

    this.farmForm.patchValue({

      name: farm.name,

      location: farm.location,

      area: farm.area ?? null,

      areaUnit: farm.areaUnit ?? 'acre',

      status: farm.status,

      latitude: farm.latitude ?? null,

      longitude: farm.longitude ?? null

    });

    this.isLoading = false;

  }

  // =====================================================
  // Submit
  // =====================================================

  saveFarm(): void {

    if (this.farmForm.invalid) {

      this.farmForm.markAllAsTouched();

      return;

    }

    this.isSaving = true;

    const formValue = this.farmForm.getRawValue();

    const updatedFarm =
      this.farmService.updateFarm(
        this.farmId,
        {

          name: formValue.name,

          location: formValue.location,

          area: formValue.area,

          areaUnit: formValue.areaUnit,

          status: formValue.status,

          latitude: formValue.latitude,

          longitude: formValue.longitude

        }
      );

    if (!updatedFarm) {

      this.isSaving = false;

      return;

    }

    this.router.navigate([
      '/farms',
      this.farmId
    ]);

  }

  // =====================================================
  // Cancel
  // =====================================================

  cancel(): void {

    this.router.navigate([
      '/farms',
      this.farmId
    ]);

  }

  // =====================================================
  // Back
  // =====================================================

  goBack(): void {

    this.router.navigate(['/farms']);

  }

  // =====================================================
  // Helpers
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

}