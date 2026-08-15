// Nạp CSS Leaflet + sửa đường dẫn icon marker mặc định (bundler làm hỏng path
// tương đối gốc của Leaflet). Import file này một lần trong mỗi component map.
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/** Tile công khai của OpenStreetMap dùng chung cho mọi bản đồ. */
export const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Tâm mặc định khi chưa có toạ độ: trung tâm TP.HCM. */
export const DEFAULT_CENTER: [number, number] = [10.8231, 106.6297];
