import { Injectable } from '@angular/core';
import {
  createClient,
  SupabaseClient
} from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {

  public client: SupabaseClient;

  constructor() {

    this.client = createClient(
      'https://dcdjntjzcqmhaxpcualb.supabase.co/rest/v1/',
      'sb_publishable_YoNfUY6N1pO7MjDgASRxjw_qG8_LW20'
    );

  }
}