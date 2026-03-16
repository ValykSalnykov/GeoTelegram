'use client';

import React, { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
  GeoJSON,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ProcessingTask } from '@/lib/types';

interface MapViewProps {
  tasks: ProcessingTask[];
  selectedCenter: [number, number] | null;
}

function MapController({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, 16, { duration: 1.5 });
    }
  }, [center, map]);
  return null;
}

export default function MapView({ tasks, selectedCenter }: MapViewProps) {
  return (
    <MapContainer
      center={[46.4825, 30.7233]}
      zoom={12}
      style={{ height: '100%', width: '100%' }}
    >
      <MapController center={selectedCenter} />
      <TileLayer
        attribution='&copy; <a href="https://www.google.com/maps">Google Maps</a>'
        url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
      />
      {tasks
        .filter(
          (t) =>
            (t.status === 'found' || t.status === 'possibly_found') && t.locations
        )
        .flatMap((t) =>
          t.locations!.map((loc, idx) => (
            <React.Fragment key={`${t.id}-${idx}`}>
              {t.status === 'possibly_found' &&
                loc.geojson &&
                loc.geojson.type !== 'Point' && (
                  <GeoJSON
                    data={loc.geojson}
                    style={{ color: '#f59e0b', weight: 6, opacity: 0.5 }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <p className="font-semibold mb-1">{loc.address}</p>
                        <p className="text-xs text-slate-600">"{t.text}"</p>
                        <p className="text-[10px] text-slate-400 mt-2">
                          {new Date(t.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </Popup>
                  </GeoJSON>
                )}
              <CircleMarker
                center={[loc.lat, loc.lng]}
                radius={8}
                pathOptions={{
                  color: t.status === 'possibly_found' ? '#f59e0b' : '#3b82f6',
                  fillColor: t.status === 'possibly_found' ? '#f59e0b' : '#3b82f6',
                  fillOpacity: 0.9,
                  weight: 4,
                  opacity: 0.5,
                }}
              >
                <Popup>
                  <div className="text-sm">
                    <p className="font-semibold mb-1">{loc.address}</p>
                    <p className="text-xs text-slate-600">"{t.text}"</p>
                    <p className="text-[10px] text-slate-400 mt-2">
                      {new Date(t.timestamp).toLocaleString()}
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            </React.Fragment>
          ))
        )}
    </MapContainer>
  );
}
