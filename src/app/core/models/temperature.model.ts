export interface TemperatureDiagnostics {
  status: 'Completed' | 'Processing' | 'Failed' | 'Unknown';
  resultReceived: boolean;
  heatmapActivityId?: string;
  environmentalActivityId?: string;
  resultKeys?: string[];
  statsKeys?: string[];
  featuresCount?: number;
  nCells?: number;
}

export interface TemperatureReading {
  id?: string;
  farmId?: string;
  zoneId?: string;
  temperature: number;
  feelsLike?: number;
  humidity?: number;
  heatIndex?: number;
  wetBulbTemperature?: number;
  precipitation?: number;
  cloudCover?: number;
  aqi?: number;
  solarIrradiance?: unknown;
  recordedAt: string;
  source?: 'api' | 'sensor' | 'mock';
  diagnostics?: TemperatureDiagnostics;
}

export interface TemperatureForecast {
  timestamp: string;
  temperature: number;
  feelsLike?: number;
  humidity?: number;
  condition?: string;
}
