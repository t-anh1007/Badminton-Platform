import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { ImageUploadPicker, type UploadImageState } from './CommunityComposer.js'

const FIVE_MB = 5 * 1024 * 1024

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

const setup = () => {
  const authorize = vi.fn().mockResolvedValue({ objectKey: 'match/results/key', uploadUrl: 'https://upload', headers: {}, expiresAt: '2026-09-26T00:00:00Z' })
  const upload = vi.fn().mockResolvedValue(undefined)
  const onUploadedChange = vi.fn<(items: UploadImageState[]) => void>()
  render(<ImageUploadPicker label="Thêm ảnh" maxFiles={3} maxBytes={FIVE_MB} authorize={authorize} upload={upload} onUploadedChange={onUploadedChange} />)
  return { authorize, upload, onUploadedChange, input: screen.getByLabelText('Thêm ảnh') }
}

it('rejects an image one byte over 5 MB before asking for an upload slot', async () => {
  const { authorize, input } = setup()
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(FIVE_MB + 1)], 'big.png', { type: 'image/png' })] } })
  expect(await screen.findByText('Ảnh vượt quá 5 MB.')).toBeInTheDocument()
  expect(authorize).not.toHaveBeenCalled()
})

it('forwards size and SHA-256 checksum to authorization and keeps the checksum on the uploaded image', async () => {
  const { authorize, onUploadedChange, input } = setup()
  fireEvent.change(input, { target: { files: [new File(['abc'], 'score.png', { type: 'image/png' })] } })
  // SHA-256("abc") dạng base64.
  const checksumSha256 = 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0='
  await waitFor(() => expect(authorize).toHaveBeenCalledWith('image/png', { size: 3, checksumSha256 }))
  await waitFor(() => expect(onUploadedChange.mock.lastCall?.[0][0]).toMatchObject({ status: 'uploaded', objectKey: 'match/results/key', checksumSha256 }))
})
