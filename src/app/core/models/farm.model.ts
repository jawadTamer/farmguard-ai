export interface Farm {
  id: string;
  name: string;
  location: string;
  description?: string;

  latitude?: number;
  longitude?: number;

  area?: number;
  areaUnit?: 'acre' | 'hectare';

  status: 'active' | 'inactive';

  zonesCount?: number;
  cropsCount?: number;
  livestockCount?: number;

  createdAt?: string;
  updatedAt?: string;
}