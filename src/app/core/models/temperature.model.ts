export interface TemperatureReading {
  id?: string;

  farmId?: string;
  zoneId?: string;

  temperature: number;

  feelsLike?: number;

  humidity?: number;

  recordedAt: string;

  source?: 'api' | 'sensor' | 'mock';
}
export interface TemperatureForecast {
  timestamp: string;

  temperature: number;

  feelsLike?: number;

  humidity?: number;

  condition?: string;
}