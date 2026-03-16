export interface Location {
  address: string | null | undefined;
  lat: number;
  lng: number;
  geojson?: any;
}

export interface ProcessingTask {
  id: string;
  text: string;
  timestamp: string;
  status: 'processing_ai' | 'processing_geo' | 'found' | 'possibly_found' | 'not_found';
  addressToGeocode?: string;
  matchType?: 'exact' | 'possible';
  reason?: string;
  isSimulated?: boolean;
  locations?: Location[];
  inRaduzhnyiZone?: boolean;
  channel?: string;
}
