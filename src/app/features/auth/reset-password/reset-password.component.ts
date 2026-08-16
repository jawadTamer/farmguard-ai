import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.css'
})
export class ResetPasswordComponent {

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  password = '';
  confirmPassword = '';

  loading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  async updatePassword(): Promise<void> {

    this.errorMessage.set('');
    this.successMessage.set('');

    if (!this.password) {
      this.errorMessage.set('Please enter your new password.');
      return;
    }

    if (this.password.length < 6) {
      this.errorMessage.set('Password must be at least 6 characters.');
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.errorMessage.set('Passwords do not match.');
      return;
    }

    this.loading.set(true);

    try {
      await this.authService.updatePassword(this.password);

      this.successMessage.set(
        'Password has been updated successfully.'
      );

      setTimeout(() => {
        this.router.navigate(['/login']);
      }, 2000);

    } catch (error: any) {

      this.errorMessage.set(
        error?.message ?? 'Something went wrong. Please try again.'
      );

    } finally {
      this.loading.set(false);
    }
  }
}
