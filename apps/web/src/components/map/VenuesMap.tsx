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
  coverImage?: string | null;
  courtCount: number;
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

function escapeAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function venueIcon(venue: VenueMapPoint) {
  const content = venue.coverImage
    ? `<img src="${escapeAttribute(venue.coverImage)}" alt="" style="display:block;width:44px;height:44px;object-fit:cover;border-radius:10px" />`
    : '<span aria-hidden="true" style="display:grid;width:44px;height:44px;place-items:center;border-radius:10px;background:#fff;font-size:22px">🏸</span>';
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:50px;height:50px;padding:3px;border-radius:13px;background:#f7df4b;border:2px solid #174f78;box-shadow:0 4px 12px rgba(23,79,120,.35)">${content}</span>`,
    iconSize: [50, 50],
    iconAnchor: [25, 50],
    popupAnchor: [0, -46],
  });
}

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
        <Marker key={venue.venueId} position={[venue.lat, venue.lng]} icon={venueIcon(venue)}>
          <Popup className="courtin-venue-popup" minWidth={296} maxWidth={310}>
            <div className="flex min-h-[292px] flex-col overflow-hidden rounded-xl bg-brand-navy text-surface shadow-xl">
              <div className="relative h-24 shrink-0 overflow-hidden bg-brand-navy-raised">
                {venue.coverImage
                  ? <img src={venue.coverImage} alt={`Ảnh ${venue.name}`} className="h-full w-full object-cover" />
                  : <div className="grid h-full place-items-center text-4xl" aria-hidden="true">🏸</div>}
                <span className="absolute left-2 top-2 rounded-full bg-success px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white shadow">● Có thể đặt</span>
                <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-brand-navy to-transparent" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col p-3.5 pt-2">
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-brand-yellow">COURTIN · Đặt sân trực tiếp</p>
                <h3 className="mt-1 font-display text-base font-extrabold leading-tight text-white">{venue.name}</h3>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-surface/70">{venue.address}</p>
                <div className="mt-2 grid grid-cols-3 gap-1 border-y border-white/15 py-2 text-center">
                  <div><strong className="block text-sm text-brand-yellow">{venue.courtCount}</strong><span className="text-[10px] text-surface/65">Sân con</span></div>
                  <div><strong className="block text-sm text-white">{venue.distanceKm.toFixed(1)}</strong><span className="text-[10px] text-surface/65">Km từ bạn</span></div>
                  <div><strong className="block text-sm text-brand-yellow">{venue.lowestPrice ? `${Math.round(Number(venue.lowestPrice) / 1000)}K` : '—'}</strong><span className="text-[10px] text-surface/65">Giá từ</span></div>
                </div>
                <Link className="mt-auto flex min-h-9 items-center justify-center rounded-full bg-brand-yellow px-3 text-[11px] font-extrabold uppercase tracking-wide text-brand-navy transition hover:bg-brand-yellow-hover" to={`/venues/${encodeURIComponent(venue.venueId)}`}>Xem lịch và đặt sân <span className="ml-2" aria-hidden="true">→</span></Link>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
