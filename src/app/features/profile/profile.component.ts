import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import Swal from 'sweetalert2';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-profile',
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
    MatDividerModule,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent implements OnInit {
  profileForm: FormGroup;
  isLoading = true;
  isSaving = false;
  errorMessage = '';

  currentUser: any = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private snackBar: MatSnackBar,
  ) {
    this.profileForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      email: [{ value: '', disabled: true }],
    });
  }

  ngOnInit(): void {
    void this.loadUserProfile();
  }

  async loadUserProfile(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const user = await this.authService.getCurrentUser();
      this.currentUser = user;

      if (!user) {
        this.errorMessage = 'Unable to load user profile.';
        this.isLoading = false;
        return;
      }

      this.profileForm.patchValue({
        fullName: user.user_metadata?.['full_name'] || '',
        email: user.email || '',
      });
    } catch (error) {
      console.error('Failed to load user profile:', error);
      this.errorMessage = 'Unable to load user profile.';
    } finally {
      this.isLoading = false;
    }
  }

  get fullName() {
    return this.profileForm.get('fullName');
  }

  async onSave(): Promise<void> {
    this.errorMessage = '';

    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;

    try {
      const fullName = this.profileForm.get('fullName')?.value;

      const data = await this.authService.updateUserMetadata({
        full_name: fullName,
      });

      this.currentUser = data.user;

      this.snackBar.open('Profile updated successfully', 'Close', {
        duration: 3000,
        horizontalPosition: 'end',
        verticalPosition: 'top',
      });
    } catch (error) {
      console.error('Failed to update profile:', error);
      this.errorMessage = 'Failed to update profile. Please try again.';
    } finally {
      this.isSaving = false;
    }
  }

  getCreatedDate(): string {
    if (!this.currentUser?.created_at) {
      return 'Not available';
    }
    return new Date(this.currentUser.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  getLastSignInDate(): string {
    if (!this.currentUser?.last_sign_in_at) {
      return 'Not available';
    }
    return new Date(this.currentUser.last_sign_in_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
