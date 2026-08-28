import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet default icon issue in bundlers (Vite/Webpack)
// Instead of importing images directly, we use CDN URLs
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Bus Icon using divIcon
const createBusIcon = (isActive: boolean = true) => L.divIcon({
  html: `<div style="
    background: ${isActive ? '#2563eb' : '#94a3b8'};
    width: 36px; height: 36px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 4px 14px rgba(37,99,235,0.35);
    display: flex; align-items: center; justify-content: center;
  ">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>
      <path d="M18 18h3s.5-1.5.8-2.8c.1-.4.2-.8.2-1.2v-7c0-1-1-2-2-2H4c-1 0-2 1-2 2v7c0 .4.1.8.2 1.2.3 1.3.8 2.8.8 2.8h3"/>
      <circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>
    </svg>
  </div>`,
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20],
});

// Component to auto-recenter map when coordinates change
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], undefined, { animate: true });
  }, [lat, lng, map]);
  return null;
}

interface Vehicle {
  id: string;
  lat: number;
  lng: number;
  label: string;
  details?: string;
  speed?: number;
  isActive?: boolean;
}

interface LiveMapProps {
  vehicles: Vehicle[];
  center?: [number, number];
  zoom?: number;
  autoRecenter?: boolean;
}

export function LiveMap({ vehicles, center = [28.6139, 77.2090], zoom = 13, autoRecenter = true }: LiveMapProps) {
  // Use first vehicle's position as center if available
  const mapCenter: [number, number] = vehicles.length > 0
    ? [vehicles[0].lat, vehicles[0].lng]
    : center;

  return (
    <div className="h-full w-full rounded-2xl overflow-hidden shadow-sm border border-slate-100 relative">
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        style={{ height: '100%', width: '100%', zIndex: 1 }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {vehicles.map((v) => (
          <Marker key={v.id} position={[v.lat, v.lng]} icon={createBusIcon(v.isActive !== false)}>
            <Popup>
              <div className="p-1 min-w-[160px]">
                <p className="font-bold text-slate-900 text-sm">{v.label}</p>
                {v.details && <p className="text-xs text-slate-500 mt-1">{v.details}</p>}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Live Tracking
                  </span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {autoRecenter && vehicles.length === 1 && (
          <RecenterMap lat={vehicles[0].lat} lng={vehicles[0].lng} />
        )}
      </MapContainer>

      {/* Status overlay */}
      <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg border border-slate-100 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${vehicles.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
        <span style={{ fontSize: '10px', fontWeight: 700, color: vehicles.length > 0 ? '#16a34a' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {vehicles.length > 0 ? `${vehicles.length} Active` : 'No Signal'}
        </span>
      </div>
    </div>
  );
}
