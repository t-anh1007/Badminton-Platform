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

/** Bỏ quốc gia và mã bưu chính ở cuối để nhãn địa chỉ gọn trên giao diện. */
export function formatLocationLabel(label: string): string {
  const parts = label.split(',').map((part) => part.trim()).filter(Boolean);
  if (/^(việt nam|viet nam)$/i.test(parts.at(-1) ?? '')) parts.pop();
  if (/^\d{4,6}$/.test(parts.at(-1) ?? '')) parts.pop();
  return parts.join(', ');
}

function toResult(place: NominatimPlace): GeoResult {
  return { label: formatLocationLabel(place.display_name), lat: Number(place.lat), lng: Number(place.lon) };
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

interface IpWhoIsPlace {
  success?: boolean;
  latitude?: number;
  longitude?: number;
  city?: string;
  region?: string;
  country?: string;
}

/**
 * Vị trí gần đúng theo IP — dùng làm fallback khi Geolocation trình duyệt bị
 * chặn/treo (ví dụ máy bàn không có nguồn định vị wifi). Chỉ ở mức thành
 * phố/quận, không thay thế GPS. Endpoint HTTPS, miễn phí, không cần key.
 */
export async function ipLocate(signal?: AbortSignal): Promise<GeoResult | null> {
  try {
    const res = await fetch('https://ipwho.is/', { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as IpWhoIsPlace;
    if (data.success === false || typeof data.latitude !== 'number' || typeof data.longitude !== 'number') return null;
    const label = formatLocationLabel([data.city, data.region, data.country].filter(Boolean).join(', ')) || 'Vị trí gần đúng';
    return { label, lat: data.latitude, lng: data.longitude };
  } catch {
    return null;
  }
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
  return data.display_name ? formatLocationLabel(data.display_name) : null;
}
