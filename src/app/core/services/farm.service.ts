import { Injectable } from '@angular/core';
import { Farm } from '../models/farm.model';

@Injectable({
  providedIn: 'root'
})
export class FarmService {

  private farms: Farm[] = [

    {
      id: 'farm-001',
      name: 'Main Tomato Farm',
      location: 'Fayoum, Egypt',

      latitude: 29.3084,
      longitude: 30.8428,

      area: 25,
      areaUnit: 'acre',

      status: 'active',

      zonesCount: 4,
      cropsCount: 3,
      livestockCount: 0
    },

    {
      id: 'farm-002',
      name: 'Green Valley',
      location: 'Fayoum, Egypt',

      area: 18,
      areaUnit: 'acre',

      status: 'active',

      zonesCount: 3,
      cropsCount: 2,
      livestockCount: 12
    },

    {
      id: 'farm-003',
      name: 'North Field',
      location: 'Fayoum, Egypt',

      area: 30,
      areaUnit: 'acre',

      status: 'active',

      zonesCount: 5,
      cropsCount: 4,
      livestockCount: 0
    }

  ];


  getFarms(): Farm[] {

    return this.farms;

  }


  getFarmById(id: string): Farm | undefined {

    return this.farms.find(
      farm => farm.id === id
    );

  }

}