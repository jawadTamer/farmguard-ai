export interface FarmZone {
  id: string;
  farmId: string;

  name: string;
  description?: string;

  latitude?: number;
  longitude?: number;

  area?: number;

  createdAt?: string;

  boundary?: unknown;
}