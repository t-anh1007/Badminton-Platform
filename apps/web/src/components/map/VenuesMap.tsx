import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { DEFAULT_CENTER, OSM_ATTRIBUTION, OSM_TILE_URL } from './leafletSetup';

export interface VenueMapPoint {
  venueId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceKm: number;
  lowestPrice?: string | null;
}

interface VenuesMapProps {
  origin: { lat: number; lng: number };
  venues: VenueMapPoint[];
  /** Cho phép click bản đồ để đổi điểm gốc tìm kiếm. */
  onPickOrigin?: (lat: number, lng: number) => void;
  className?: string;
}

// Icon xanh cho điểm gốc (vị trí người dùng), phân biệt với marker sân.
const originIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:16px;height:16px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px rgba(37,99,235,.4)"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function FitBounds({ origin, venues }: { origin: { lat: number; lng: number }; venues: VenueMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = [[origin.lat, origin.lng], ...venues.map((v) => [v.lat, v.lng] as [number, number])];
    if (points.length === 1) {
      map.setView(points[0], 13);
    } else {
      map.fitBounds(L.latLngBounds(points).pad(0.2));
    }
  }, [map, origin, venues]);
  return null;
}

function OriginPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (event) => onPick(event.latlng.lat, event.latlng.lng) });
  return null;
}

/** Bản đồ danh sách sân: marker cho từng sân + điểm gốc tìm kiếm. */
export function VenuesMap({ origin, venues, onPickOrigin, className = '' }: VenuesMapProps) {
  return (
    <MapContainer
      center={origin.lat && origin.lng ? [origin.lat, origin.lng] : DEFAULT_CENTER}
      zoom={13}
      scrollWheelZoom
      className={`h-[28rem] w-full rounded-2xl ${className}`}
      aria-label="Bản đồ các sân"
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
      <FitBounds origin={origin} venues={venues} />
      {onPickOrigin && <OriginPicker onPick={onPickOrigin} />}
      <Marker position={[origin.lat, origin.lng]} icon={originIcon}>
        <Popup>Vị trí tìm kiếm của bạn</Popup>
      </Marker>
      {venues.map((venue) => (
        <Marker key={venue.venueId} position={[venue.lat, venue.lng]}>
          <Popup>
            <strong>{venue.name}</strong>
            <br />
            <span>{venue.address}</span>
            <br />
            <span>~{venue.distanceKm.toFixed(1)} km</span>
            {venue.lowestPrice ? <span> · Từ {Number(venue.lowestPrice).toLocaleString('vi-VN')}₫</span> : null}
            <br />
            <Link to={`/venues/${encodeURIComponent(venue.venueId)}`}>Xem chi tiết →</Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
