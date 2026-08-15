export interface Crop {
  id: string;
  farmId: string;
  zoneId?: string;

  name: string;

  variety?: string;

  growthStage:
    | 'germination'
    | 'vegetative'
    | 'flowering'
    | 'fruiting'
    | 'maturity';

  plantingDate?: string;
  expectedHarvestDate?: string;

  optimalTemperatureMin?: number;
  optimalTemperatureMax?: number;

  heatStressTemperature?: number;

  status: 'healthy' | 'warning' | 'critical';

  createdAt?: string;
  updatedAt?: string;
}