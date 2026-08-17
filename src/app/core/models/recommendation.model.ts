export type RecommendationType =
  | 'irrigation'
  | 'spraying'
  | 'shading'
  | 'ventilation'
  | 'monitoring'
  | 'livestock-care';

export type RecommendationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Recommendation {
  id?: string;

  farmId?: string;
  zoneId?: string;

  type: RecommendationType;

  priority: RecommendationPriority;

  title: string;

  description: string;

  actionItems: string[];

  riskLevel?: 'low' | 'moderate' | 'high' | 'critical';

  createdAt: string;

  expiresAt?: string;

  isCompleted?: boolean;
}
