import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.css'
})
export class ForgotPasswordComponent {

  private readonly authService = inject(AuthService);

  email = '';

  loading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  async resetPassword(): Promise<void> {

    this.errorMessage.set('');
    this.successMessage.set('');

    if (!this.email) {
      this.errorMessage.set('Please enter your email.');
      return;
    }

    this.loading.set(true);

    try {

      const { error } =
        await this.authService.resetPassword(this.email);

      if (error) {
        this.errorMessage.set(error.message);
        return;
      }

      this.successMessage.set(
        'Password reset link has been sent to your email.'
      );

    } catch (error: any) {

      this.errorMessage.set(
        error?.message ?? 'Something went wrong.'
      );

    } finally {
      this.loading.set(false);
    }
  }
}