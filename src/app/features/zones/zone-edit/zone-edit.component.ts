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
import { FarmZone } from '../../../core/models/farm-zone.model';

@Component({
  selector: 'app-zone-edit',
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
  templateUrl: './zone-edit.component.html',
  styleUrl: './zone-edit.component.css',
})
export class ZoneEditComponent implements OnInit {
  zoneForm: FormGroup;

  zoneId = '';
  farmId = '';
  farms: Farm[] = [];
  zone?: FarmZone;

  isLoading = true;
  isSaving = false;
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
      description: ['', [Validators.maxLength(500)]],
      area: [null, [Validators.min(0)]],
      latitude: [null, [Validators.min(-90), Validators.max(90)]],
      longitude: [null, [Validators.min(-180), Validators.max(180)]],
    });
  }

  ngOnInit(): void {
    const zoneId = this.route.snapshot.paramMap.get('zoneId');
    const farmId = this.route.snapshot.paramMap.get('farmId');

    if (!zoneId) {
      this.errorMessage = 'Zone information is missing.';
      this.isLoading = false;
      return;
    }

    this.zoneId = zoneId;
    if (farmId) {
      this.farmId = farmId;
    }

    void this.loadData();
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const [farms, zone] = await Promise.all([
        this.farmService.getFarms(),
        this.zoneService.getZoneById(this.zoneId),
      ]);

      this.farms = farms;
      this.zone = zone;

      if (!zone) {
        this.errorMessage = 'Zone not found.';
        this.isLoading = false;
        return;
      }

      if (!this.farmId && zone.farmId) {
        this.farmId = zone.farmId;
      }

      const selectedFarm =
        this.farms.find((farm) => farm.id === this.farmId) ??
        this.farms.find((farm) => farm.id === zone.farmId);

      if (selectedFarm) {
        this.farmId = selectedFarm.id;
      }

      this.zoneForm.patchValue({
        farmId: this.farmId || zone.farmId,
        name: zone.name,
        description: zone.description ?? '',
        area: zone.area ?? null,
        latitude: zone.latitude ?? null,
        longitude: zone.longitude ?? null,
      });
    } catch (error) {
      console.error('Failed to load zone for edit:', error);
      this.errorMessage = 'Unable to load zone information. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  async saveZone(): Promise<void> {
    this.errorMessage = '';

    if (this.zoneForm.invalid) {
      this.zoneForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;

    try {
      const formValue = this.zoneForm.getRawValue();
      const selectedFarmId = formValue.farmId;
      this.farmId = selectedFarmId;

      await this.zoneService.updateZone(this.zoneId, {
        farmId: selectedFarmId,
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

      if (this.farmId) {
        await this.router.navigate(['/farms', this.farmId, 'zones']);
        return;
      }

      await this.router.navigate(['/zones']);
    } catch (error) {
      console.error('Failed to update zone:', error);
      this.errorMessage = 'Failed to update the zone. Please try again.';
    } finally {
      this.isSaving = false;
    }
  }

  cancel(): void {
    if (this.farmId) {
      this.router.navigate(['/farms', this.farmId, 'zones']);
      return;
    }

    this.router.navigate(['/zones']);
  }

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
}
