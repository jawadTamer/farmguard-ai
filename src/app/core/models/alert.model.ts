export type AlertType =
  | 'temperature'
  | 'heat-stress'
  | 'irrigation'
  | 'spraying'
  | 'livestock'
  | 'system';

export type AlertSeverity =
  | 'info'
  | 'warning'
  | 'critical';

export interface FarmAlert {
  id: string;

  farmId?: string;
  zoneId?: string;

  type: AlertType;

  severity: AlertSeverity;

  title: string;

  message: string;

  isRead: boolean;

  createdAt: string;

  expiresAt?: string;
}