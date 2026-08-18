import { Observable } from 'rxjs';
import { TemperatureReading, TemperatureForecast } from '../models/temperature.model';

export interface TemperatureProvider {
  /**
   * Get current temperature for a specific farm/zone
   */
  getCurrentTemperature(farmId: string, zoneId?: string): Promise<TemperatureReading | null>;

  /**
   * Get temperature history for a specific farm/zone
   */
  getTemperatureHistory(farmId: string, zoneId?: string, days?: number): Promise<TemperatureReading[]>;

  /**
   * Get temperature forecast for a specific farm/zone
   */
  getForecast(farmId: string, zoneId?: string): Promise<TemperatureForecast[]>;

  /**
   * Save a temperature reading
   */
  saveTemperatureReading(reading: TemperatureReading): Promise<void>;

  /**
   * Provider name for debugging/logging
   */
  readonly providerName: string;
}
