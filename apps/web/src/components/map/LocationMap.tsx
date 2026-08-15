import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { OSM_ATTRIBUTION, OSM_TILE_URL } from './leafletSetup';

interface LocationMapProps {
  lat: number;
  lng: number;
  /** Nội dung popup gắn marker (tuỳ chọn). */
  label?: string;
  zoom?: number;
  className?: string;
}

/** Bản đồ OSM chỉ-đọc hiển thị một vị trí kèm marker. */
export function LocationMap({ lat, lng, label, zoom = 15, className = '' }: LocationMapProps) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={zoom}
      scrollWheelZoom={false}
      className={`h-56 w-full rounded-2xl ${className}`}
      aria-label="Bản đồ vị trí"
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
      <Marker position={[lat, lng]}>{label && <Popup>{label}</Popup>}</Marker>
    </MapContainer>
  );
}
