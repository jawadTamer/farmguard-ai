export interface Livestock {
  id: string;
  zoneId: string;

  livestockType: string;
  breed?: string;
  count?: number;

  ageGroup?: string;
  sex?: 'male' | 'female';
  physiologicalStage?: string;
  ageYears?: number;
  weightKg?: number;

  createdAt?: string;
  updatedAt?: string;
}
