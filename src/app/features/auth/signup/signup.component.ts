import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink
  ],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.css'
})
export class SignupComponent {

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  fullName = '';
  email = '';
  phone = '';
  password = '';
  confirmPassword = '';

  loading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  async signup(): Promise<void> {

    this.errorMessage.set('');
    this.successMessage.set('');

    if (
      !this.fullName ||
      !this.email ||
      !this.password
    ) {
      this.errorMessage.set(
        'Please fill in all required fields.'
      );
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.errorMessage.set(
        'Passwords do not match.'
      );
      return;
    }

    if (this.password.length < 6) {
      this.errorMessage.set(
        'Password must be at least 6 characters.'
      );
      return;
    }

    this.loading.set(true);

    try {

      const { data, error } =
        await this.authService.signUp(
          this.email,
          this.password,
          this.fullName,
          this.phone
        );

      if (error) {
        this.errorMessage.set(error.message);
        return;
      }

      if (data.session) {

        await this.router.navigate(['/dashboard']);

      } else {

        this.successMessage.set(
          'Account created successfully. Please check your email to verify your account.'
        );
      }

    } catch (error: any) {

      this.errorMessage.set(
        error?.message ?? 'Something went wrong.'
      );

    } finally {
      this.loading.set(false);
    }
  }
}