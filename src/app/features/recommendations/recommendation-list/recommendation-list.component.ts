import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Farm } from '../../../core/models/farm.model';
import { FarmService } from '../../../core/services/farm.service';
import { AuthService } from '../../../core/auth/auth.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: string[];
  urgency?: 'low' | 'moderate' | 'high' | 'critical';
}

@Component({
  selector: 'app-recommendation-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recommendation-list.component.html',
  styleUrl: './recommendation-list.component.css',
})
export class RecommendationListComponent implements OnInit {
  farms: Farm[] = [];
  selectedFarmId = '';
  message = '';
  loading = false;
  loadingFarms = true;
  error = '';
  conversationId: string | null = null;
  messages: ChatMessage[] = [
    {
      role: 'assistant',
      content:
        'Hello! I am your FarmGuard AI Advisor. Ask me about heat risk, your crops, livestock, irrigation, shade, ventilation, or what you should do next.',
    },
  ];

  constructor(
    private readonly farmService: FarmService,
    private readonly supabase: SupabaseService,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      // Make sure the Supabase session has been restored before the first
      // Edge Function call. The function requires a real user JWT.
      await this.authService.initialize();

      if (!(await this.authService.hasValidSession())) {
        await this.router.navigate(['/login']);
        return;
      }

      this.farms = await this.farmService.getFarms();
      this.selectedFarmId = this.farms[0]?.id ?? '';
    } catch (error) {
      console.error('[AI Advisor] Failed to initialize:', error);
      this.error = 'Could not load your farms.';
    } finally {
      this.loadingFarms = false;
    }
  }

  /**
   * Return a current Supabase access token. If the existing session is
   * expired, explicitly refresh it before calling the Edge Function.
   */
  private async getAccessToken(): Promise<string> {
    const client = this.supabase.client;

    let { data, error } = await client.auth.getSession();

    if (error) {
      throw new Error(`Could not read authentication session: ${error.message}`);
    }

    let session = data.session;

    if (!session) {
      throw new Error('Your login session is missing. Please sign in again.');
    }

    const expiresAt = session.expires_at ?? 0;
    const isExpiredOrNearExpiry = expiresAt * 1000 <= Date.now() + 30_000;

    if (isExpiredOrNearExpiry) {
      const refreshed = await client.auth.refreshSession();

      if (refreshed.error || !refreshed.data.session) {
        await client.auth.signOut({ scope: 'local' });
        throw new Error('Your login session expired. Please sign in again.');
      }

      session = refreshed.data.session;
    }

    return session.access_token;
  }

  async send(): Promise<void> {
    const text = this.message.trim();
    if (!text || !this.selectedFarmId || this.loading) return;

    this.error = '';
    this.messages.push({ role: 'user', content: text });
    this.message = '';
    this.loading = true;

    try {
      // Do not rely on a stale/initial auth state. Resolve the current JWT
      // immediately before every protected Edge Function request.
      const accessToken = await this.getAccessToken();

      const { data, error } = await this.supabase.client.functions.invoke(
        'ai-advisor',
        {
          body: {
            farmId: this.selectedFarmId,
            message: text,
            conversationId: this.conversationId,
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (error) throw error;

      if (!data?.success || !data?.answer) {
        throw new Error(data?.error ?? 'AI Advisor returned an invalid response.');
      }

      this.conversationId = data.conversationId ?? this.conversationId;
      this.messages.push({
        role: 'assistant',
        content: data.answer.answer,
        actions: data.answer.actions ?? [],
        urgency: data.answer.urgency,
      });
    } catch (error: any) {
      console.error('[AI Advisor] Request failed:', error);

      if (error?.status === 401 || error?.context?.status === 401) {
        await this.supabase.client.auth.signOut({ scope: 'local' });
        await this.router.navigate(['/login']);
        return;
      }

      this.error = error?.message ?? 'AI Advisor request failed.';
      this.messages.push({
        role: 'assistant',
        content: 'I could not reach the AI Advisor right now. Please try again in a moment.',
      });
    } finally {
      this.loading = false;
    }
  }

  onFarmChange(): void {
    this.conversationId = null;
    this.messages = [
      {
        role: 'assistant',
        content:
          "Farm changed. I am ready to answer questions using this farm's crops, livestock, weather, and risk assessments.",
      },
    ];
  }

  useSuggestion(text: string): void {
    this.message = text;
  }

  get selectedFarm(): Farm | undefined {
    return this.farms.find((farm) => farm.id === this.selectedFarmId);
  }
}
