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
  ) { }

  async ngOnInit(): Promise<void> {
    try {
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
   * Return the current Supabase access token and refresh it when it is
   * expired/near expiry. This method never logs the user out by itself.
   */
  private async getAccessToken(): Promise<string> {
    const client = this.supabase.client;

    const { data, error } = await client.auth.getSession();

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
        throw new Error('Your login session expired. Please sign in again.');
      }

      session = refreshed.data.session;
    }

    return session.access_token;
  }

  private async invokeAdvisor(accessToken: string, text: string) {
    return await this.supabase.client.functions.invoke('ai-advisor', {
      body: {
        farmId: this.selectedFarmId,
        message: text,
        conversationId: this.conversationId,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  async send(): Promise<void> {
    const text = this.message.trim();
    if (!text || !this.selectedFarmId || this.loading) return;

    this.error = '';
    this.messages.push({ role: 'user', content: text });
    this.message = '';
    this.loading = true;

    try {
      let accessToken = await this.getAccessToken();
      let result = await this.invokeAdvisor(accessToken, text);

      // A protected Edge Function can reject an otherwise valid-but-stale
      // access token. Refresh once and retry. Do NOT log the user out merely
      // because the Edge Function returned 401; that 401 may be a function
      // gateway/configuration problem rather than an invalid login session.
      if (result.error?.status === 401 || result.error?.context?.status === 401) {
        const refreshed = await this.supabase.client.auth.refreshSession();

        if (refreshed.error || !refreshed.data.session) {
          await this.router.navigate(['/login']);
          return;
        }

        accessToken = refreshed.data.session.access_token;
        result = await this.invokeAdvisor(accessToken, text);
      }

      if (result.error) throw result.error;

      const data = result.data;

      if (!data?.success || !data?.answer) {
        throw new Error(data?.error ?? 'AI Advisor returned an invalid response.');
      }

      this.conversationId = data.conversationId ?? this.conversationId;

      // Handle answer - it might be a stringified JSON or a direct object
      let answerContent: string;
      let answerActions: string[] = [];
      let answerUrgency: 'low' | 'moderate' | 'high' | 'critical' | undefined;

      console.log('Raw data.answer:', data.answer);
      console.log('Type of data.answer:', typeof data.answer);

      if (typeof data.answer === 'string') {
        // Try to parse if it's a JSON string
        try {
          const parsedAnswer = JSON.parse(data.answer);
          console.log('Parsed answer:', parsedAnswer);
          answerContent = parsedAnswer.answer || parsedAnswer.message || data.answer;
          answerActions = parsedAnswer.actions || [];
          // Handle both 'urgency' and 'priority' field names
          answerUrgency = parsedAnswer.urgency || parsedAnswer.priority;
          console.log('Extracted answerContent:', answerContent);
        } catch (parseError) {
          console.error('Failed to parse answer as JSON:', parseError);
          // If parsing fails, use as-is
          answerContent = data.answer;
        }
      } else if (typeof data.answer === 'object') {
        // It's already an object
        console.log('Answer is already an object:', data.answer);
        let rawAnswer = data.answer.answer || data.answer.message;
        console.log('Raw answer from object:', rawAnswer);
        console.log('Type of rawAnswer:', typeof rawAnswer);

        // Check if the answer field itself is a stringified JSON
        if (typeof rawAnswer === 'string' && rawAnswer.trim().startsWith('{')) {
          console.log('rawAnswer is a stringified JSON, attempting to parse...');
          try {
            const doubleParsed = JSON.parse(rawAnswer);
            console.log('Double-parsed object:', doubleParsed);
            answerContent = doubleParsed.answer || doubleParsed.message || rawAnswer;
            console.log('Extracted answerContent from double-parsed:', answerContent);
          } catch (doubleParseError) {
            console.error('Failed to double-parse:', doubleParseError);
            answerContent = rawAnswer;
          }
        } else {
          console.log('rawAnswer is not a stringified JSON, using as-is');
          answerContent = rawAnswer || JSON.stringify(data.answer);
        }

        answerActions = data.answer.actions || [];
        // Handle both 'urgency' and 'priority' field names
        answerUrgency = data.answer.urgency || data.answer.priority;
        console.log('Final answerContent:', answerContent);
        console.log('Extracted answerUrgency:', answerUrgency);
      } else {
        answerContent = String(data.answer);
      }

      this.messages.push({
        role: 'assistant',
        content: answerContent,
        actions: answerActions,
        urgency: answerUrgency,
      });
    } catch (error: any) {
      console.error('[AI Advisor] Request failed:', error);

      // IMPORTANT: Do not call signOut() here. A 401 from the Edge Function
      // must not destroy the user's local Supabase session. Only the normal
      // authentication flow should decide when a user is actually logged out.
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
