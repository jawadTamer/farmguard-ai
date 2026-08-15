import { Injectable } from '@angular/core';
import {
  TemperatureForecast,
  TemperatureReading
} from '../models/temperature.model';

@Injectable({
  providedIn: 'root'
})
export class TemperatureService {

  private currentTemperature: TemperatureReading = {
    id: 'temp-001',
    farmId: 'farm-001',
    zoneId: 'zone-001',

    temperature: 41,
    feelsLike: 43,
    humidity: 38,

    recordedAt: new Date().toISOString(),

    source: 'mock'
  };


  getCurrentTemperature(): TemperatureReading {

    return this.currentTemperature;

  }


  getForecast(): TemperatureForecast[] {

    return [
      {
        timestamp: '2026-08-15T12:00:00',
        temperature: 37,
        feelsLike: 39,
        humidity: 42,
        condition: 'Sunny'
      },

      {
        timestamp: '2026-08-15T15:00:00',
        temperature: 41,
        feelsLike: 43,
        humidity: 38,
        condition: 'Hot'
      },

      {
        timestamp: '2026-08-15T18:00:00',
        temperature: 34,
        feelsLike: 35,
        humidity: 48,
        condition: 'Clear'
      },

      {
        timestamp: '2026-08-15T21:00:00',
        temperature: 30,
        feelsLike: 31,
        humidity: 55,
        condition: 'Clear'
      }
    ];

  }

}