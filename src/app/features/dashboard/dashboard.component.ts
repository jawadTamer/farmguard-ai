import { Component, inject } from '@angular/core';

import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent {

  private readonly authService = inject(AuthService);

  async logout(): Promise<void> {
    await this.authService.signOut();
  }
}