import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, it, expect } from 'vitest'
vi.mock('../lib/passportApi', () => ({ getOwnPassport: vi.fn().mockResolvedValue({ userId:'u', tier:'intermediate', declaredTier:'intermediate', rating:1500, rd:350, sigma:.06, uncertainty:'high', matchesPlayed:0, evaluationScore:null, evaluationCount:0, flaggedEvaluationCount:0, recentMatches:[], updatedAt:'2026-08-14T00:00:00Z', canDeclareTier:false, nextDeclarationAt:'2026-08-21T00:00:00Z' }), getPublicPassport:vi.fn(), declarePassportTier:vi.fn(), submitMatchEvaluation:vi.fn() }))
import { PassportPage } from './PassportPage.js'
it('shows the seven-day next declaration time next to the disabled action, Vietnamese title', async () => {
  localStorage.setItem('accessToken','x')
  render(<MemoryRouter><Routes><Route path="*" element={<PassportPage />} /></Routes></MemoryRouter>)
  const button = await screen.findByRole('button', { name: 'Khai báo trình độ' })
  expect(button).toBeDisabled()
  const hint = await screen.findByText(/Khai báo lại từ/)
  expect(hint).toBeInTheDocument()
  // Gợi ý cooldown phải nằm cạnh nút, không chôn dưới các thẻ khác trên trang.
  expect(button.parentElement).toContainElement(hint)
  expect(screen.getByRole('heading', { name: 'Hồ sơ trình độ' })).toBeInTheDocument()
})
