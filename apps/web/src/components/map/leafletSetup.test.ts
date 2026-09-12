import { expect, it } from 'vitest';
import { OSM_ATTRIBUTION, OSM_TILE_URL } from './leafletSetup.js';

it('uses the reachable OpenStreetMap Germany tile endpoint for map backgrounds', () => {
  expect(OSM_TILE_URL).toBe('https://tile.openstreetmap.de/{z}/{x}/{y}.png');
  expect(OSM_ATTRIBUTION).toContain('OpenStreetMap');
});
