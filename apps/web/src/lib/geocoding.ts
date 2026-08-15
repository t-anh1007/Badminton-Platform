// Geocoding qua Nominatim (OpenStreetMap). Miễn phí, không cần API key.
// Chính sách sử dụng: tối đa ~1 req/s, nên UI luôn debounce trước khi gọi.
// Docs: https://nominatim.org/release-docs/latest/api/Search/

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

export interface GeoResult {
  label: string;
  lat: number;
  lng: number;
}

interface NominatimPlace {
  display_name: string;
  lat: string;
  lon: string;
}

function toResult(place: NominatimPlace): GeoResult {
  return { label: place.display_name, lat: Number(place.lat), lng: Number(place.lon) };
}

/** Tìm địa chỉ → danh sách toạ độ (ưu tiên Việt Nam). */
export async function searchAddress(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const params = new URLSearchParams({
    q: trimmed,
    format: 'jsonv2',
    addressdetails: '0',
    limit: '6',
    countrycodes: 'vn',
    'accept-language': 'vi',
  });
  const res = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Không thể tìm địa chỉ. Hãy thử lại.');
  const data = (await res.json()) as NominatimPlace[];
  return data.map(toResult);
}

/** Toạ độ → địa chỉ (điền địa chỉ khi người dùng click/kéo marker). */
export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
    'accept-language': 'vi',
  });
  const res = await fetch(`${NOMINATIM_BASE}/reverse?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Partial<NominatimPlace>;
  return data.display_name ?? null;
}
