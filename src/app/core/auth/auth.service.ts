import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

import { SupabaseService } from '../supabase/supabase.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly _user = signal<User | null>(null);
  private readonly _session = signal<Session | null>(null);
  private readonly _initialized = signal(false);

  readonly user = this._user.asReadonly();
  readonly session = this._session.asReadonly();
  readonly initialized = this._initialized.asReadonly();

  readonly isAuthenticated = computed(() => this._session() !== null);

  private initializationPromise: Promise<void>;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly router: Router,
  ) {
    this.initializationPromise = this.initializeAuth();
  }

  /**
   * Initialize authentication state.
   */
  private async initializeAuth(): Promise<void> {
    const supabase = this.supabaseService.client;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    this.setAuthState(session);

    supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        this.setAuthState(session);
      },
    );

    this._initialized.set(true);
  }

  /**
   * Make sure authentication has been initialized.
   */
  async initialize(): Promise<void> {
    await this.initializationPromise;
  }

  /**
   * Update local authentication state.
   */
  private setAuthState(session: Session | null): void {
    this._session.set(session);
    this._user.set(session?.user ?? null);
  }

  /**
   * Clear local authentication state.
   */
  private clearAuthState(): void {
    this._session.set(null);
    this._user.set(null);
  }

  /**
   * Validate that the session still belongs to an existing Supabase user.
   */
  async hasValidSession(): Promise<boolean> {
    const session = this._session();

    if (!session) {
      return false;
    }

    const {
      data: { user },
      error,
    } = await this.supabaseService.client.auth.getUser();

    if (error || !user) {
      await this.supabaseService.client.auth.signOut({
        scope: 'local',
      });

      this.clearAuthState();

      return false;
    }

    this._user.set(user);

    return true;
  }

  /**
   * Sign up a new farmer.
   */
  async signUp(
    email: string,
    password: string,
    fullName: string,
    phone?: string,
  ) {
    const supabase = this.supabaseService.client;

    return await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phone ?? null,
          role: 'farmer',
        },
      },
    });
  }

  /**
   * Login existing user.
   */
  async signIn(email: string, password: string) {
    const supabase = this.supabaseService.client;

    return await supabase.auth.signInWithPassword({
      email,
      password,
    });
  }

  /**
   * Logout current user.
   */
  async signOut(): Promise<void> {
    const { error } = await this.supabaseService.client.auth.signOut();

    if (error) {
      throw error;
    }

    this.clearAuthState();

    await this.router.navigate(['/login']);
  }

  /**
   * Get currently authenticated user.
   */
  async getCurrentUser(): Promise<User | null> {
    const {
      data: { user },
    } = await this.supabaseService.client.auth.getUser();

    this._user.set(user);

    return user;
  }

  /**
   * Send password reset email.
   */
  async resetPassword(email: string) {
    return await this.supabaseService.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
  }
}
