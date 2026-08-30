import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private supabase: SupabaseClient = inject(SupabaseService).client;
  private router = inject(Router);

  // =========================
  // LOGIN
  // =========================
  async signIn(email: string, password: string) {

    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw error;
    }

    return data;
  }


  // =========================
  // SIGN UP
  // =========================
  async signUp(
    email: string,
    password: string,
    fullName: string
  ) {

    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });

    if (error) {
      throw error;
    }

    return data;
  }


  // =========================
  // LOGOUT
  // =========================
  async signOut() {

    const { error } = await this.supabase.auth.signOut();

    if (error) {
      throw error;
    }

    await this.router.navigate(['/login']);
  }


  // =========================
  // CURRENT USER
  // =========================
  async getCurrentUser(): Promise<User | null> {

    const {
      data: { user }
    } = await this.supabase.auth.getUser();

    return user;
  }


  // =========================
  // CURRENT SESSION
  // =========================
  async getSession() {

    const {
      data: { session },
      error
    } = await this.supabase.auth.getSession();

    if (error) {
      throw error;
    }

    return session;
  }


  // =========================
  // FORGOT PASSWORD
  // =========================
  async resetPassword(email: string) {

    const { error } =
      await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

    if (error) {
      throw error;
    }
  }


  // =========================
  // UPDATE PASSWORD
  // =========================
  async updatePassword(password: string) {

    const { data, error } =
      await this.supabase.auth.updateUser({
        password
      });

    if (error) {
      throw error;
    }

    return data;
  }


  // =========================
  // UPDATE USER METADATA
  // =========================
  async updateUserMetadata(metadata: Record<string, any>) {

    const { data, error } =
      await this.supabase.auth.updateUser({
        data: metadata
      });

    if (error) {
      throw error;
    }

    return data;
  }


  // =========================
  // CHECK AUTH
  // =========================
  async isAuthenticated(): Promise<boolean> {

    const session = await this.getSession();

    return !!session;
  }


  // =========================
  // GET USER NAME
  // =========================
  async getUserName(): Promise<string> {
    const user = await this.getCurrentUser();
    if (!user) return 'Farmer';

    const fullName = user.user_metadata?.['full_name'];
    if (fullName) return fullName;

    const email = user.email;
    if (email) {
      const namePart = email.split('@')[0];
      return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }

    return 'Farmer';
  }
}