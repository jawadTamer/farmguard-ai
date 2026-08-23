import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TemperatureService } from '../../core/services/temperature.service';
import { FarmService } from '../../core/services/farm.service';
import { HeatRiskService } from '../../core/services/heat-risk.service';
import { AlertService } from '../../core/services/alert.service';
import { Farm } from '../../core/models/farm.model';
import { TemperatureReading } from '../../core/models/temperature.model';
import { TemperatureTrendPoint } from '../../core/providers/fortyguard-temperature.provider';

interface StatCard { title: string; value: string; subtitle: string; icon: string; status?: 'normal' | 'warning' | 'danger'; }
interface TemperaturePoint { time: string; timestamp: string; temperature: number; }
interface RiskItem { name: string; type: string; level: 'Low' | 'Moderate' | 'High'; temperature: number; }

@Component({
  selector: 'app-dashboard', standalone: true,
  imports: [CommonModule, RouterLink, MatCardModule, MatButtonModule, MatChipsModule, MatProgressBarModule, MatIconModule, MatMenuModule],
  templateUrl: './dashboard.component.html', styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  constructor(private temperatureService: TemperatureService, private farmService: FarmService, private heatRiskService: HeatRiskService, private alertService: AlertService) {}

  userName = 'Jawad'; currentDate = new Date(); currentTemperature: number | null = null; feelsLike: number | null = null;
  temperatureLoading = true; temperatureError: string | null = null; temperatureStatus = 'Loading temperature...';
  temperatureDescription = 'Waiting for the FortyGuard analysis to complete.'; trendLoading = false; trendError: string | null = null;
  trendStatus = 'Loading the latest 12-hour FortyGuard trend...';

  stats: StatCard[] = [
    { title: 'Current Temperature', value: '--', subtitle: 'Loading...', icon: 'thermostat', status: 'normal' },
    { title: 'Active Farms', value: '0', subtitle: 'Loading farms...', icon: 'agriculture', status: 'normal' },
    { title: 'Heat Risk', value: '0', subtitle: 'Areas need attention', icon: 'warning', status: 'normal' },
    { title: 'Active Alerts', value: '0', subtitle: 'No active alerts', icon: 'notifications_active', status: 'normal' },
  ];

  temperaturePoints: TemperaturePoint[] = [];
  riskAreas: RiskItem[] = [];
  recommendations = [
    { icon: 'water_drop', title: 'Irrigation recommended', description: 'Consider irrigation during the cooler evening period.', priority: 'High' },
    { icon: 'wb_sunny', title: 'Avoid peak heat', description: 'Avoid spraying during peak afternoon temperatures.', priority: 'Moderate' },
    { icon: 'monitoring', title: 'Increase monitoring', description: 'Monitor high-risk crop areas during the next 24 hours.', priority: 'Moderate' },
  ];
  quickActions = [
    { icon: 'add_home', label: 'Add Farm', route: '/farms/create' }, { icon: 'grass', label: 'Add Crop', route: '/crops/create' },
    { icon: 'pets', label: 'Add Livestock', route: '/livestock/create' }, { icon: 'analytics', label: 'Heat Intelligence', route: '/heat-intelligence' },
  ];

  async ngOnInit(): Promise<void> {
    this.currentDate = new Date(); this.loadFarms(); await this.loadTemperature(); await this.loadTodayTemperatureTrend(); await this.loadHeatRisks(); await this.loadAlerts();
  }

  private async getActiveFarm(): Promise<Farm> {
    const farms = await this.farmService.getFarms();
    const activeFarm = farms.find((farm: Farm) => farm.status === 'active');
    if (!activeFarm) throw new Error('No active farm selected.');
    return activeFarm;
  }

  private async loadTemperature(): Promise<void> {
    this.temperatureLoading = true; this.temperatureError = null; this.currentTemperature = null; this.feelsLike = null;
    this.temperatureStatus = 'Loading temperature...'; this.temperatureDescription = 'FortyGuard is processing the environmental analysis.';
    this.stats[0].value = '--'; this.stats[0].subtitle = 'Loading from FortyGuard...';
    try {
      const farm = await this.getActiveFarm(); const reading = await this.temperatureService.getCurrentTemperature(farm.id);
      if (!reading || !Number.isFinite(Number(reading.temperature)) || Number(reading.temperature) <= 0) throw new Error('No valid temperature was returned by FortyGuard.');
      this.currentTemperature = Number(reading.temperature); this.feelsLike = Number.isFinite(Number(reading.feelsLike)) ? Number(reading.feelsLike) : this.currentTemperature;
      this.updateTemperatureStatus(this.currentTemperature); this.updateTemperatureStat();
    } catch (e) {
      console.error('[Dashboard] Failed to load temperature:', e); this.temperatureError = e instanceof Error ? e.message : 'Unable to load temperature.';
      this.temperatureStatus = 'Temperature unavailable'; this.temperatureDescription = 'The FortyGuard result was not available. Please refresh and try again.';
      this.stats[0].value = '--'; this.stats[0].subtitle = 'Unable to load'; this.stats[0].status = 'warning';
    } finally { this.temperatureLoading = false; }
  }

  private async loadTodayTemperatureTrend(): Promise<void> {
    this.trendLoading = true; this.trendError = null; this.temperaturePoints = []; this.trendStatus = 'Loading 12 hours from FortyGuard...';
    try {
      const farm = await this.getActiveFarm();
      const points: TemperatureTrendPoint[] = await this.temperatureService.getTodayTemperatureTrend(farm.id, undefined, this.currentTemperature ?? undefined);
      this.temperaturePoints = points
        .filter(p => Number.isFinite(Number(p.temperature)))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .map(p => ({ timestamp: p.timestamp, time: this.formatTrendTime(p.timestamp), temperature: Number(p.temperature) }));
      this.trendStatus = this.temperaturePoints.length
        ? `${this.temperaturePoints.length} hourly temperature readings from FortyGuard.`
        : 'FortyGuard returned no valid temperature points.';
    } catch (e) {
      console.error('[Dashboard] Failed to load FortyGuard temperature trend:', e);
      this.trendError = e instanceof Error ? e.message : 'Unable to load the 12-hour temperature trend.';
      this.trendStatus = 'FortyGuard trend unavailable.';
    } finally { this.trendLoading = false; }
  }

  private formatTrendTime(timestamp: string): string {
    const d = new Date(timestamp); if (Number.isNaN(d.getTime())) return timestamp;
    return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
  }

  formatTemperature(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return (Math.trunc(Number(value) * 10) / 10).toFixed(1);
  }

  getTrendBarHeight(temperature: number): number {
    const min = Math.max(20, this.getMinTemperature() - 2); const max = Math.max(min + 10, this.getMaxTemperature() + 2);
    return Math.max(8, Math.min(100, ((temperature - min) / (max - min)) * 100));
  }

  getTrendAxisValues(): number[] {
    const min = Math.floor(Math.max(20, this.getMinTemperature() - 2) / 5) * 5; const max = Math.ceil(Math.max(min + 10, this.getMaxTemperature() + 2) / 5) * 5;
    const step = Math.max(5, (max - min) / 4); return [max, max - step, max - step * 2, max - step * 3, min].map(v => Math.round(v));
  }

  private updateTemperatureStatus(t: number): void {
    if (t >= 42) { this.temperatureStatus = 'Critical Heat Risk'; this.temperatureDescription = 'Temperature has reached a critical level and immediate action may be required.'; return; }
    if (t >= 38) { this.temperatureStatus = 'High Heat Risk'; this.temperatureDescription = 'Temperature is above the optimal range for some crops.'; return; }
    if (t >= 34) { this.temperatureStatus = 'Moderate Heat Risk'; this.temperatureDescription = 'Temperature is approaching the upper safe range.'; return; }
    this.temperatureStatus = 'Low Heat Risk'; this.temperatureDescription = 'Temperature is currently within a safe range.';
  }

  private updateTemperatureStat(): void {
    if (this.currentTemperature === null) { this.stats[0].value = '--'; this.stats[0].subtitle = 'No data available'; return; }
    this.stats[0].value = `${this.formatTemperature(this.currentTemperature)}°C`; this.stats[0].subtitle = this.feelsLike === null ? 'Feels like unavailable' : `Feels like ${this.formatTemperature(this.feelsLike)}°C`;
    this.stats[0].status = this.currentTemperature >= 38 ? 'danger' : this.currentTemperature >= 34 ? 'warning' : 'normal';
  }

  private async loadFarms(): Promise<void> { try { const farms = await this.farmService.getFarms(); const active = farms.filter((f: Farm) => f.status === 'active'); this.stats[1].value = active.length.toString(); this.stats[1].subtitle = active.length === 1 ? '1 farm monitored' : 'All farms monitored'; } catch (e) { console.error('Failed to load farms:', e); this.stats[1].value = '0'; this.stats[1].subtitle = 'Unable to load farms'; } }

  private async loadHeatRisks(): Promise<void> { const risks = await this.heatRiskService.getRisks(); const attention = risks.filter((r: any) => r.riskLevel === 'high' || r.riskLevel === 'critical'); this.stats[2].value = attention.length.toString(); this.stats[2].subtitle = attention.length === 0 ? 'No areas need attention' : attention.length === 1 ? '1 area needs attention' : 'Areas need attention'; this.riskAreas = risks.map((r: any) => ({ name: this.getRiskAreaName(r.id), type: this.getRiskAreaType(r.id), level: r.riskLevel === 'critical' || r.riskLevel === 'high' ? 'High' : r.riskLevel === 'moderate' ? 'Moderate' : 'Low', temperature: Number(r.temperature) })); }
  private getRiskAreaName(id?: string): string { return id === 'risk-001' ? 'Tomato Field A' : id === 'risk-002' ? 'Greenhouse B' : id === 'risk-003' ? 'Corn Field' : 'Farm Area'; }
  private getRiskAreaType(id?: string): string { return id === 'risk-001' ? 'Tomato · Flowering' : id === 'risk-002' ? 'Cucumber · Fruiting' : id === 'risk-003' ? 'Corn · Vegetative' : 'Unknown Crop'; }
  private async loadAlerts(): Promise<void> { const alerts = await this.alertService.getAlerts(); const active = alerts.filter((a: any) => !a.isRead); const critical = active.filter((a: any) => a.severity === 'critical'); this.stats[3].value = active.length.toString(); this.stats[3].subtitle = active.length === 0 ? 'No active alerts' : critical.length === 1 ? '1 critical alert' : critical.length > 1 ? `${critical.length} critical alerts` : 'No critical alerts'; this.stats[3].status = critical.length ? 'danger' : active.length ? 'warning' : 'normal'; }

  async refreshDashboard(): Promise<void> { this.currentDate = new Date(); await this.loadTemperature(); await this.loadTodayTemperatureTrend(); this.loadFarms(); await this.loadHeatRisks(); await this.loadAlerts(); }
  getMaxTemperature(): number { return this.temperaturePoints.length ? Math.max(...this.temperaturePoints.map(p => p.temperature)) : 0; }
  getMinTemperature(): number { return this.temperaturePoints.length ? Math.min(...this.temperaturePoints.map(p => p.temperature)) : 0; }
  getRiskClass(level: string): string { return level === 'High' ? 'risk-high' : level === 'Moderate' ? 'risk-moderate' : 'risk-low'; }
  getStatusClass(status?: string): string { return status === 'danger' ? 'status-danger' : status === 'warning' ? 'status-warning' : 'status-normal'; }
  getTemperatureStatusClass(): string { if (this.currentTemperature === null) return 'status-warning'; return this.currentTemperature >= 38 ? 'status-danger' : this.currentTemperature >= 34 ? 'status-warning' : 'status-normal'; }
  getRecommendationClass(priority: string): string { return priority === 'High' ? 'priority-high' : priority === 'Moderate' ? 'priority-moderate' : 'priority-low'; }
}
