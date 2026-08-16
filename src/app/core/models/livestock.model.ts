export interface Livestock {
  id: string;
  zoneId: string;

  livestockType: string;
  breed?: string;
  count?: number;

  ageGroup?: string;

  createdAt?: string;
  updatedAt?: string;
}
