import { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { Marker as LeafletMarker } from 'leaflet';
import { DEFAULT_CENTER, OSM_ATTRIBUTION, OSM_TILE_URL } from './leafletSetup';
import { searchAddress, reverseGeocode, type GeoResult } from '../../lib/geocoding';

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
}

function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (event) => onPick(event.latlng.lat, event.latlng.lng) });
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
export function LocationPicker({ value, onChange, onAddressResolved, className = '' }: LocationPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
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
    if (resolveAddress && onAddressResolved) {
      void reverseGeocode(lat, lng).then((addr) => { if (addr) onAddressResolved(addr); });
    }
  };

  const pickResult = (result: GeoResult) => {
    setQuery(result.label);
    setResults([]);
    onChange({ lat: result.lat, lng: result.lng });
    onAddressResolved?.(result.label);
  };

  return (
    <div className={`grid gap-2 ${className}`}>
      <div className="relative">
        <input
          aria-label="Tìm địa chỉ trên bản đồ"
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

      <MapContainer
        center={value ? [value.lat, value.lng] : DEFAULT_CENTER}
        zoom={value ? 15 : 12}
        scrollWheelZoom
        className="h-72 w-full rounded-2xl"
        aria-label="Bản đồ chọn vị trí"
      >
        <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
        <ClickCapture onPick={(lat, lng) => commit(lat, lng, true)} />
        <Recenter value={value} />
        {value && (
          <Marker
            position={[value.lat, value.lng]}
            draggable
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

      <p className="text-xs text-ink-500">
        {value
          ? `Đã chọn: ${value.lat.toFixed(6)}, ${value.lng.toFixed(6)} — click hoặc kéo marker để chỉnh.`
          : 'Tìm địa chỉ hoặc click lên bản đồ để đặt vị trí sân.'}
      </p>
    </div>
  );
}
