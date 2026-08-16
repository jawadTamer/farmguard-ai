export type AreaUnit =
  | 'acre'
  | 'hectare'
  | 'feddan'
  | 'square_meter';

export interface Farm {
  id: string;
  name: string;
  location: string;
  description?: string;

  latitude?: number;
  longitude?: number;

  area?: number;
  areaUnit?: AreaUnit;

  status: 'active' | 'inactive';

  zonesCount?: number;
  cropsCount?: number;
  livestockCount?: number;

  createdAt?: string;
  updatedAt?: string;
}