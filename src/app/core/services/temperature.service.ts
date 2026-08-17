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

  private temperatureHistory: TemperatureReading[] = [
    {
      id: 'temp-hist-001',
      farmId: 'farm-001',
      zoneId: 'zone-001',
      temperature: 38,
      feelsLike: 40,
      humidity: 42,
      recordedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      source: 'mock'
    },
    {
      id: 'temp-hist-002',
      farmId: 'farm-001',
      zoneId: 'zone-001',
      temperature: 39,
      feelsLike: 41,
      humidity: 40,
      recordedAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
      source: 'mock'
    },
    {
      id: 'temp-hist-003',
      farmId: 'farm-001',
      zoneId: 'zone-001',
      temperature: 40,
      feelsLike: 42,
      humidity: 39,
      recordedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      source: 'mock'
    },
    {
      id: 'temp-hist-004',
      farmId: 'farm-001',
      zoneId: 'zone-001',
      temperature: 41,
      feelsLike: 43,
      humidity: 38,
      recordedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      source: 'mock'
    },
    {
      id: 'temp-hist-005',
      farmId: 'farm-001',
      zoneId: 'zone-001',
      temperature: 41,
      feelsLike: 43,
      humidity: 38,
      recordedAt: new Date().toISOString(),
      source: 'mock'
    }
  ];

  getCurrentTemperature(farmId?: string, zoneId?: string): TemperatureReading {
    if (farmId || zoneId) {
      const filtered = this.temperatureHistory.filter(
        t => (!farmId || t.farmId === farmId) && (!zoneId || t.zoneId === zoneId)
      );
      if (filtered.length > 0) {
        return filtered[filtered.length - 1];
      }
    }
    return this.currentTemperature;
  }

  getForecast(farmId?: string, zoneId?: string): TemperatureForecast[] {
    return [
      {
        timestamp: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        temperature: 37,
        feelsLike: 39,
        humidity: 42,
        condition: 'Sunny'
      },
      {
        timestamp: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        temperature: 41,
        feelsLike: 43,
        humidity: 38,
        condition: 'Hot'
      },
      {
        timestamp: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString(),
        temperature: 34,
        feelsLike: 35,
        humidity: 48,
        condition: 'Clear'
      },
      {
        timestamp: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        temperature: 30,
        feelsLike: 31,
        humidity: 55,
        condition: 'Clear'
      }
    ];
  }

  getTemperatureHistory(farmId?: string, zoneId?: string, days: number = 7): TemperatureReading[] {
    let history = this.temperatureHistory;

    if (farmId || zoneId) {
      history = history.filter(
        t => (!farmId || t.farmId === farmId) && (!zoneId || t.zoneId === zoneId)
      );
    }

    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return history.filter(t => new Date(t.recordedAt) >= cutoffDate);
  }
}