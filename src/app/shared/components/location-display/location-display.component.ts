import {
  Component,
  AfterViewInit,
  OnDestroy,
  Input,
  ElementRef,
  ViewChild,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

import * as L from 'leaflet';

@Component({
  selector: 'app-location-display',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './location-display.component.html',
  styleUrl: './location-display.component.css',
})
export class LocationDisplayComponent
  implements AfterViewInit, OnDestroy, OnInit
{
  @ViewChild('mapContainer', { static: false })
  mapContainer!: ElementRef<HTMLDivElement>;

  @Input() latitude?: number;
  @Input() longitude?: number;
  @Input() height = '300px';

  private map: L.Map | null = null;
  private marker: L.Marker | null = null;

  hasLocation = false;

  ngOnInit(): void {
    this.hasLocation =
      this.latitude !== undefined &&
      this.longitude !== undefined &&
      this.latitude !== 0 &&
      this.longitude !== 0;
  }

  ngAfterViewInit(): void {
    if (this.hasLocation && this.latitude && this.longitude) {
      this.initializeMap();
    }
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private initializeMap(): void {
    if (!this.mapContainer || !this.latitude || !this.longitude) {
      return;
    }

    this.map = L.map(this.mapContainer.nativeElement, {
      center: [this.latitude, this.longitude],
      zoom: 13,
      zoomControl: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      dragging: false,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(this.map);

    const icon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl:
        'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    this.marker = L.marker([this.latitude, this.longitude], { icon }).addTo(
      this.map
    );
  }
}
