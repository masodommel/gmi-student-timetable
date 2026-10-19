export type AirCategory = 'Good' | 'Moderate' | 'Unhealthy' | 'Very Unhealthy' | 'Hazardous';

export interface AirStationConfig {
  id: string;
  name: string;
}

export interface AirStationReading {
  id: string;
  name: string;
  value: number | null;
  category: AirCategory | null;
  observedAt: string | null;
}

export interface AirSnapshot {
  schemaVersion: 1;
  fetchedAt: string;
  stations: AirStationReading[];
}

export type AirReading =
  | { status: 'unavailable'; station: AirStationConfig | undefined }
  | { status: 'fresh' | 'stale'; station: AirStationConfig; value: number; category: AirCategory; observedAt: string };
