import {
  Component,
  AfterViewInit,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import * as L from 'leaflet';

@Component({
  selector: 'app-location-picker',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './location-picker.component.html',
  styleUrl: './location-picker.component.css',
})
export class LocationPickerComponent
  implements AfterViewInit, OnDestroy, OnInit
{
  @ViewChild('mapContainer', { static: false })
  mapContainer!: ElementRef<HTMLDivElement>;

  @Input() latitude?: number;
  @Input() longitude?: number;
  @Input() height = '400px';

  @Output() locationSelected = new EventEmitter<{
    latitude: number;
    longitude: number;
  }>();

  private map: L.Map | null = null;
  private marker: L.Marker | null = null;

  isLoadingLocation = false;
  locationError = '';

  currentLat?: number;
  currentLng?: number;

  ngOnInit(): void {
    this.currentLat = this.latitude;
    this.currentLng = this.longitude;
  }

  ngAfterViewInit(): void {
    this.initializeMap();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private initializeMap(): void {
    if (!this.mapContainer) {
      return;
    }

    const defaultLat = this.latitude ?? 0;
    const defaultLng = this.longitude ?? 0;
    const zoom = this.latitude && this.longitude ? 13 : 2;

    this.map = L.map(this.mapContainer.nativeElement).setView(
      [defaultLat, defaultLng],
      zoom
    );

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(this.map);

    if (this.latitude && this.longitude) {
      this.addMarker(this.latitude, this.longitude);
    }

    this.map.on('click', (event: L.LeafletMouseEvent) => {
      const { lat, lng } = event.latlng;
      this.updateLocation(lat, lng);
    });
  }

  private addMarker(lat: number, lng: number): void {
    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
    } else {
      const icon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      this.marker = L.marker([lat, lng], { icon }).addTo(this.map!);
    }
  }

  private updateLocation(lat: number, lng: number): void {
    this.currentLat = lat;
    this.currentLng = lng;

    this.addMarker(lat, lng);

    this.locationSelected.emit({ latitude: lat, longitude: lng });
  }

  useCurrentLocation(): void {
    this.locationError = '';
    this.isLoadingLocation = true;

    if (!navigator.geolocation) {
      this.locationError =
        'Geolocation is not supported by your browser.';
      this.isLoadingLocation = false;
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        this.updateLocation(latitude, longitude);

        if (this.map) {
          this.map.setView([latitude, longitude], 15);
        }

        this.isLoadingLocation = false;
      },
      (error) => {
        this.isLoadingLocation = false;

        switch (error.code) {
          case error.PERMISSION_DENIED:
            this.locationError =
              'Location permission denied. Please enable location access.';
            break;
          case error.POSITION_UNAVAILABLE:
            this.locationError =
              'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            this.locationError =
              'Location request timed out. Please try again.';
            break;
          default:
            this.locationError =
              'An error occurred while getting your location.';
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }

  resetLocation(): void {
    this.currentLat = undefined;
    this.currentLng = undefined;

    if (this.marker) {
      this.map!.removeLayer(this.marker);
      this.marker = null;
    }

    if (this.map) {
      this.map.setView([0, 0], 2);
    }

    this.locationSelected.emit({ latitude: 0, longitude: 0 });
  }

  get hasLocation(): boolean {
    return this.currentLat !== undefined && this.currentLng !== undefined;
  }
}
