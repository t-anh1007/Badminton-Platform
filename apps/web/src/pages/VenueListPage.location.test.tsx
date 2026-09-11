import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { VenueListPage } from './VenueListPage.js'
import { ipLocate, reverseGeocode } from '../lib/geocoding.js'

vi.mock('../lib/venueBookingApi.js', () => ({
  searchVenues: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/geocoding.js', () => ({
  ipLocate: vi.fn().mockResolvedValue({ label: 'Quận 1', lat: 10.77, lng: 106.7 }),
  reverseGeocode: vi.fn().mockResolvedValue(null),
}))

let onSuccess: PositionCallback
let onError: PositionErrorCallback

beforeEach(() => {
  onSuccess = undefined as never
  onError = undefined as never
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success: PositionCallback, error: PositionErrorCallback) => {
        onSuccess = success
        onError = error
      }),
    },
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  sessionStorage.clear()
})

it('keeps waiting for GPS after a transient geolocation error instead of showing the IP fallback', async () => {
  render(<MemoryRouter initialEntries={['/venues']}><VenueListPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: /hiện bộ lọc/i }))

  onError({ code: 2, message: 'position temporarily unavailable', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })

  await waitFor(() => expect(screen.getByRole('button', { name: 'Đang định vị…' })).toBeInTheDocument())
  expect(ipLocate).not.toHaveBeenCalled()
  expect(screen.queryByText(/Không lấy được GPS chính xác/i)).not.toBeInTheDocument()

  onSuccess({ coords: { latitude: 10.8, longitude: 106.6, accuracy: 1, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) }, timestamp: Date.now(), toJSON: () => ({}) })
  expect(await screen.findByText('Vị trí của bạn · 10.80000, 106.60000')).toBeInTheDocument()
})

it('starts geolocation when the venue filter mounts', () => {
  render(<MemoryRouter initialEntries={['/venues']}><VenueListPage /></MemoryRouter>)
  expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledOnce()
})

it('restores the current location picked on the embedded home filter when opening the venue page', async () => {
  const home = render(<MemoryRouter initialEntries={['/']}><VenueListPage embedded initialViewMode="map" /></MemoryRouter>)
  onSuccess({ coords: { latitude: 10.8, longitude: 106.6, accuracy: 1, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) }, timestamp: Date.now(), toJSON: () => ({}) })
  fireEvent.click(screen.getByRole('button', { name: /hiện bộ lọc/i }))
  expect(await screen.findByText('Vị trí của bạn · 10.80000, 106.60000')).toBeInTheDocument()

  home.unmount()
  render(<MemoryRouter initialEntries={['/venues']}><VenueListPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: /hiện bộ lọc/i }))
  expect(screen.getByText('Vị trí của bạn · 10.80000, 106.60000')).toBeInTheDocument()
})

it('stores the reverse-geocoded label for the venue page opened after the home filter', async () => {
  vi.mocked(reverseGeocode).mockResolvedValue('12 Nguyễn Huệ, Quận 1, TP.HCM')
  const home = render(<MemoryRouter initialEntries={['/']}><VenueListPage embedded initialViewMode="map" /></MemoryRouter>)
  onSuccess({ coords: { latitude: 10.8, longitude: 106.6, accuracy: 1, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) }, timestamp: Date.now(), toJSON: () => ({}) })
  fireEvent.click(screen.getByRole('button', { name: /hiện bộ lọc/i }))
  expect(await screen.findByText('12 Nguyễn Huệ, Quận 1, TP.HCM')).toBeInTheDocument()

  home.unmount()
  render(<MemoryRouter initialEntries={['/venues']}><VenueListPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: /hiện bộ lọc/i }))
  expect(screen.getByText('12 Nguyễn Huệ, Quận 1, TP.HCM')).toBeInTheDocument()
})
