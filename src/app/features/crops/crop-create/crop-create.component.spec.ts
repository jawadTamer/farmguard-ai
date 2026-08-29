import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { CropCreateComponent } from './crop-create.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

describe('CropCreateComponent', () => {
  let component: CropCreateComponent;
  let fixture: ComponentFixture<CropCreateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        CropCreateComponent,
        ReactiveFormsModule,
        RouterTestingModule,
        NoopAnimationsModule,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        MatFormFieldModule,
        MatInputModule,
        MatProgressSpinnerModule,
        MatSelectModule,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CropCreateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default growth stage as vegetative', () => {
    expect(component.cropForm.get('growthStage')?.value).toBe('vegetative');
  });

  it('should accept valid growth stages', () => {
    const validStages = ['maturity', 'planted', 'reproductive', 'vegetative'];
    
    validStages.forEach(stage => {
      component.cropForm.patchValue({ growthStage: stage });
      expect(component.cropForm.get('growthStage')?.value).toBe(stage);
      expect(component.cropForm.get('growthStage')?.valid).toBe(true);
    });
  });

  it('should reject invalid growth stages', () => {
    const invalidStages = ['germination', 'flowering', 'fruiting', 'invalid'];
    
    invalidStages.forEach(stage => {
      component.cropForm.patchValue({ growthStage: stage });
      expect(component.cropForm.get('growthStage')?.hasError('invalidGrowthStage')).toBe(true);
    });
  });

  it('should require growth stage', () => {
    component.cropForm.patchValue({ growthStage: '' });
    expect(component.cropForm.get('growthStage')?.hasError('required')).toBe(true);
  });

  it('should have growthStage getter', () => {
    expect(component.growthStage).toBeTruthy();
  });
});