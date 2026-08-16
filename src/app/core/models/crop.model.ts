export interface Crop {
  id: string;
  zoneId: string;

  cropType: string;
  variety?: string;

  growthStage: string;
  plantingDate?: string;

  createdAt?: string;
  updatedAt?: string;
}
