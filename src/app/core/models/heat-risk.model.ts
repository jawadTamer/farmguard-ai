export type HeatRiskLevel =
  | 'low'
  | 'moderate'
  | 'high'
  | 'critical';

export interface HeatRisk {
  id?: string;

  farmId: string;
  zoneId?: string;

  cropId?: string;

  temperature: number;

  riskLevel: HeatRiskLevel;

  riskScore?: number;

  reason: string;

  detectedAt: string;

  expiresAt?: string;
}