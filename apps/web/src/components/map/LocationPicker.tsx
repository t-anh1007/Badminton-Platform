import { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L, { type Marker as LeafletMarker } from 'leaflet';
import { DEFAULT_CENTER, OSM_ATTRIBUTION, OSM_TILE_URL } from './leafletSetup';
import { ipLocate, searchAddress, reverseGeocode, type GeoResult } from '../../lib/geocoding';

const pickedLocationIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:20px;height:20px;border-radius:9999px;background:#f7df4b;border:4px solid #174f78;box-shadow:0 2px 8px rgba(23,79,120,.45)"></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

export interface PickedLocation {
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  value: PickedLocation | null;
  onChange: (next: PickedLocation) => void;
  /** Gọi khi Nominatim trả về địa chỉ cho điểm vừa chọn (để điền ô địa chỉ). */
  onAddressResolved?: (address: string) => void;
  className?: string;
  disabled?: boolean;
}

function ClickCapture({ onPick, disabled = false }: { onPick: (lat: number, lng: number) => void; disabled?: boolean }) {
  useMapEvents({ click: (event) => { if (!disabled) onPick(event.latlng.lat, event.latlng.lng); } });
  return null;
}

function Recenter({ value }: { value: PickedLocation | null }) {
  const map = useMap();
  useEffect(() => {
    if (value) map.setView([value.lat, value.lng], Math.max(map.getZoom(), 15));
  }, [map, value]);
  return null;
}

/** Bản đồ OSM cho phép chọn vị trí: tìm địa chỉ, click hoặc kéo marker. */
export function LocationPicker({ value, onChange, onAddressResolved, className = '', disabled = false }: LocationPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const markerRef = useRef<LeafletMarker>(null);

  // Debounce gọi Nominatim để tôn trọng rate-limit ~1 req/s.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) { setResults([]); setSearchError(''); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true); setSearchError('');
      try {
        setResults(await searchAddress(trimmed, controller.signal));
      } catch (cause) {
        if (!controller.signal.aborted) setSearchError(cause instanceof Error ? cause.message : 'Lỗi tìm kiếm.');
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 600);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query]);

  const commit = (lat: number, lng: number, resolveAddress: boolean) => {
    onChange({ lat, lng });
    if (resolveAddress) {
      void reverseGeocode(lat, lng).then((addr) => {
        if (!addr) return;
        setQuery(addr);
        onAddressResolved?.(addr);
      });
    }
  };

  const pickResult = (result: GeoResult) => {
    setQuery(result.label);
    setResults([]);
    onChange({ lat: result.lat, lng: result.lng });
    onAddressResolved?.(result.label);
  };

  const useCurrentLocation = () => {
    if (locating) return;
    setLocating(true);
    setLocationError('');
    const useIpFallback = () => {
      void ipLocate().then((place) => {
        if (place) commit(place.lat, place.lng, true);
        else setLocationError('Không thể xác định vị trí hiện tại. Hãy kiểm tra quyền vị trí của trình duyệt.');
      }).finally(() => setLocating(false));
    };
    if (!('geolocation' in navigator)) { useIpFallback(); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        commit(position.coords.latitude, position.coords.longitude, true);
        setLocating(false);
      },
      useIpFallback,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  return (
    <div className={`grid gap-2 ${className}`}>
      <div className="relative">
        <input
          aria-label="Tìm địa chỉ trên bản đồ"
          disabled={disabled}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm địa chỉ, phường/xã, tên đường…"
          className="w-full rounded-xl border border-line px-3 py-2 text-sm"
        />
        {(searching || results.length > 0 || searchError) && (
          <div className="absolute z-[1000] mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
            {searching && <p className="px-3 py-2 text-xs text-ink-500">Đang tìm…</p>}
            {searchError && <p className="px-3 py-2 text-xs text-danger">{searchError}</p>}
            {results.map((result) => (
              <button
                key={`${result.lat},${result.lng}`}
                type="button"
                onClick={() => pickResult(result)}
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-canvas"
              >
                {result.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <MapContainer
          center={value ? [value.lat, value.lng] : DEFAULT_CENTER}
          zoom={value ? 15 : 12}
          scrollWheelZoom
          className="relative z-0 h-72 w-full rounded-2xl"
          aria-label="Bản đồ chọn vị trí"
        >
          <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
          <ClickCapture disabled={disabled} onPick={(lat, lng) => commit(lat, lng, true)} />
          <Recenter value={value} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={pickedLocationIcon}
              draggable={!disabled}
              ref={markerRef}
              eventHandlers={{
                dragend: () => {
                  const pos = markerRef.current?.getLatLng();
                  if (pos) commit(pos.lat, pos.lng, true);
                },
              }}
            />
          )}
        </MapContainer>
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={disabled || locating}
          aria-label="Quay trở lại vị trí hiện tại"
          title="Quay trở lại vị trí hiện tại"
          className="absolute left-3 top-20 z-10 grid h-9 w-9 place-items-center rounded-md border-2 border-ink-400/40 bg-surface text-xl text-brand-navy shadow disabled:opacity-60"
        >
          <span aria-hidden>{locating ? '…' : '⌾'}</span>
        </button>
      </div>

      {locationError && <p className="text-xs text-danger">{locationError}</p>}

      <p className="text-xs text-ink-500">
        {value
          ? `Đã chọn: ${value.lat.toFixed(6)}, ${value.lng.toFixed(6)} — click hoặc kéo marker để chỉnh.`
          : 'Tìm địa chỉ hoặc click lên bản đồ để đặt vị trí sân.'}
      </p>
    </div>
  );
}
