import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Farm } from '../../../core/models/farm.model';
import { FarmService } from '../../../core/services/farm.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';

interface ChatMessage { role: 'user' | 'assistant'; content: string; actions?: string[]; urgency?: 'low' | 'moderate' | 'high' | 'critical'; }

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
  messages: ChatMessage[] = [{ role: 'assistant', content: 'Hello! I am your FarmGuard AI Advisor. Ask me about heat risk, your crops, livestock, irrigation, shade, ventilation, or what you should do next.' }];

  constructor(private readonly farmService: FarmService, private readonly supabase: SupabaseService) {}

  async ngOnInit(): Promise<void> {
    try {
      this.farms = await this.farmService.getFarms();
      this.selectedFarmId = this.farms[0]?.id ?? '';
    } catch (error) {
      console.error('[AI Advisor] Failed to load farms:', error);
      this.error = 'Could not load your farms.';
    } finally { this.loadingFarms = false; }
  }

  async send(): Promise<void> {
    const text = this.message.trim();
    if (!text || !this.selectedFarmId || this.loading) return;
    this.error = '';
    this.messages.push({ role: 'user', content: text });
    this.message = '';
    this.loading = true;
    try {
      const { data, error } = await this.supabase.client.functions.invoke('ai-advisor', { body: { farmId: this.selectedFarmId, message: text, conversationId: this.conversationId } });
      if (error) throw error;
      if (!data?.success || !data?.answer) throw new Error(data?.error ?? 'AI Advisor returned an invalid response.');
      this.conversationId = data.conversationId ?? this.conversationId;
      this.messages.push({ role: 'assistant', content: data.answer.answer, actions: data.answer.actions ?? [], urgency: data.answer.urgency });
    } catch (error: any) {
      console.error('[AI Advisor] Request failed:', error);
      this.error = error?.message ?? 'AI Advisor request failed.';
      this.messages.push({ role: 'assistant', content: 'I could not reach the AI Advisor right now. Please try again in a moment.' });
    } finally { this.loading = false; }
  }

  onFarmChange(): void {
    this.conversationId = null;
    this.messages = [{ role: 'assistant', content: "Farm changed. I am ready to answer questions using this farm's crops, livestock, weather, and risk assessments." }];
  }

  useSuggestion(text: string): void { this.message = text; }

  get selectedFarm(): Farm | undefined { return this.farms.find((farm) => farm.id === this.selectedFarmId); }
}
