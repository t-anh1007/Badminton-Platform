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
  searchOrigin: { lat: number; lng: number };
  currentLocation?: { lat: number; lng: number } | null;
  venues: VenueMapPoint[];
  /** Cho phép click bản đồ để đổi điểm gốc tìm kiếm. */
  onPickOrigin?: (lat: number, lng: number) => void;
  /** Đưa điểm tìm kiếm và tâm bản đồ trở lại vị trí hiện tại. */
  onReturnCurrent?: () => void;
  className?: string;
}

// Icon xanh cho vị trí hiện tại của người dùng.
const currentLocationIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:16px;height:16px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px rgba(37,99,235,.4)"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// Icon vàng cho điểm người dùng chọn để tìm sân, tách biệt với vị trí hiện tại.
const searchOriginIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#f7df4b;border:3px solid #174f78;box-shadow:0 0 0 2px rgba(247,223,75,.45)"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function FitBounds({ searchOrigin, currentLocation, venues }: { searchOrigin: { lat: number; lng: number }; currentLocation?: { lat: number; lng: number } | null; venues: VenueMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = [
      [searchOrigin.lat, searchOrigin.lng],
      ...(currentLocation ? [[currentLocation.lat, currentLocation.lng] as [number, number]] : []),
      ...venues.map((v) => [v.lat, v.lng] as [number, number]),
    ];
    if (points.length === 1) {
      map.setView(points[0], 13);
    } else {
      map.fitBounds(L.latLngBounds(points).pad(0.2));
    }
  }, [currentLocation, map, searchOrigin, venues]);
  return null;
}

function OriginPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (event) => onPick(event.latlng.lat, event.latlng.lng) });
  return null;
}

function CurrentLocationControl({ currentLocation, onReturn }: { currentLocation: { lat: number; lng: number }; onReturn: () => void }) {
  const map = useMap();
  useEffect(() => {
    const control = new L.Control({ position: 'topleft' });
    control.onAdd = () => {
      const button = L.DomUtil.create('button', 'leaflet-bar') as HTMLButtonElement;
      button.type = 'button';
      button.title = 'Trở lại vị trí hiện tại';
      button.setAttribute('aria-label', 'Trở lại vị trí hiện tại');
      button.innerHTML = '<span aria-hidden="true" style="display:grid;width:32px;height:32px;place-items:center;background:#fff;border-radius:4px;font-size:24px;line-height:1;color:#174f78">⌾</span>';
      L.DomEvent.disableClickPropagation(button);
      L.DomEvent.on(button, 'click', () => {
        onReturn();
        map.setView([currentLocation.lat, currentLocation.lng], 13);
      });
      return button;
    };
    control.addTo(map);
    return () => { control.remove(); };
  }, [currentLocation, map, onReturn]);
  return null;
}

/** Bản đồ danh sách sân: marker cho từng sân + điểm gốc tìm kiếm. */
export function VenuesMap({ searchOrigin, currentLocation, venues, onPickOrigin, onReturnCurrent, className = '' }: VenuesMapProps) {
  return (
    <MapContainer
      center={searchOrigin.lat && searchOrigin.lng ? [searchOrigin.lat, searchOrigin.lng] : DEFAULT_CENTER}
      zoom={13}
      scrollWheelZoom
      className={`relative z-0 h-[28rem] w-full rounded-2xl ${className}`}
      aria-label="Bản đồ các sân"
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
      <FitBounds searchOrigin={searchOrigin} currentLocation={currentLocation} venues={venues} />
      {onPickOrigin && <OriginPicker onPick={onPickOrigin} />}
      {currentLocation && onReturnCurrent && <CurrentLocationControl currentLocation={currentLocation} onReturn={onReturnCurrent} />}
      {currentLocation && (
        <Marker position={[currentLocation.lat, currentLocation.lng]} icon={currentLocationIcon}>
          <Popup>Vị trí hiện tại của bạn</Popup>
        </Marker>
      )}
      <Marker position={[searchOrigin.lat, searchOrigin.lng]} icon={searchOriginIcon}>
        <Popup>Điểm bạn muốn tìm sân</Popup>
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
