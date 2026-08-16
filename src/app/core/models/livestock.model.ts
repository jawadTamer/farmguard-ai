export interface Livestock {
  id: string;
  zoneId: string;

  livestockType: string;
  breed?: string;
  count?: number;

  status?: 'healthy' | 'warning' | 'critical';

  createdAt?: string;
  updatedAt?: string;
}
