import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  loading = false;
  showPassword = false;
  errorMessage = '';

  loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],

    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async login(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();

      return;
    }

    this.loading = true;
    this.errorMessage = '';

    try {
      const { email, password } = this.loginForm.getRawValue();

      const { error } = await this.authService.signIn(email, password);

      if (error) {
        throw error;
      }

      await this.router.navigate(['/dashboard']);
    } catch (error: any) {
      console.error(error);

      this.errorMessage = error?.message || 'Invalid email or password.';
    } finally {
      this.loading = false;
    }
  }
}
