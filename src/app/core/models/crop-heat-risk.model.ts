export interface CropHeatRiskRequest {
  hour: number;
  day_of_year: number;
  month: number;
  temperature_c: number;
  relative_humidity_percent: number;
  ghi_w_m2: number;
  dni_w_m2: number;
  dhi_w_m2: number;
  location: string;
  latitude: number;
  longitude: number;
  days_since_planting: number;
  growth_stage: 'maturity' | 'planted' | 'reproductive' | 'vegetative';
  heat_index_approx: number;
}

export interface HeatRiskProbabilities {
  Critical: number;
  High: number;
  Low: number;
  Moderate: number;
}

export interface CropHeatRiskPrediction {
  heat_risk_class: 'Low' | 'Moderate' | 'High' | 'Critical';
  probabilities: HeatRiskProbabilities;
}

export interface CropHeatRiskResponse {
  predictions: CropHeatRiskPrediction[];
  status: string;
}