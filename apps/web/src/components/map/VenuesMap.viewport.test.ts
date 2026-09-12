import { expect, it } from 'vitest'
import { shouldFocusCurrentLocation } from './VenuesMap.js'

it('focuses the current-location marker when it is also the search origin', () => {
  expect(shouldFocusCurrentLocation({ lat: 10.8, lng: 106.6 }, { lat: 10.8, lng: 106.6 })).toBe(true)
})
