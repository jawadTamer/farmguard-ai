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


  // =====================================================
  // Get All Farms
  // =====================================================

  getFarms(): Farm[] {

    return [...this.farms];

  }


  // =====================================================
  // Get Farm By ID
  // =====================================================

  getFarmById(
    id: string
  ): Farm | undefined {

    return this.farms.find(
      farm => farm.id === id
    );

  }


  // =====================================================
  // Add Farm
  // =====================================================

  addFarm(
    farmData: Omit<
      Farm,
      | 'id'
      | 'zonesCount'
      | 'cropsCount'
      | 'livestockCount'
    >
  ): Farm {

    const newFarm: Farm = {

      id: this.generateFarmId(),

      name: farmData.name,

      location: farmData.location,

      latitude: farmData.latitude,

      longitude: farmData.longitude,

      area: farmData.area,

      areaUnit: farmData.areaUnit,

      status: farmData.status,

      zonesCount: 0,

      cropsCount: 0,

      livestockCount: 0

    };


    this.farms.push(newFarm);


    return newFarm;

  }


  // =====================================================
  // Update Farm
  // =====================================================

  updateFarm(
    id: string,
    farmData: Partial<Farm>
  ): Farm | undefined {

    const index =
      this.farms.findIndex(
        farm => farm.id === id
      );


    if (index === -1) {
      return undefined;
    }


    this.farms[index] = {

      ...this.farms[index],

      ...farmData,

      id

    };


    return this.farms[index];

  }


  // =====================================================
  // Delete Farm
  // =====================================================

  deleteFarm(
    id: string
  ): boolean {

    const index =
      this.farms.findIndex(
        farm => farm.id === id
      );


    if (index === -1) {
      return false;
    }


    this.farms.splice(index, 1);


    return true;

  }


  // =====================================================
  // Generate Farm ID
  // =====================================================

  private generateFarmId(): string {

    return `farm-${Date.now()}`;

  }

}