import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SessionProvider } from './session/SessionProvider.tsx'
import { warmUpBackend } from './lib/warmUp'


// Đánh thức backend ngay khi tải trang, trước khi người xem kịp bấm gì.
warmUpBackend()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider><App /></SessionProvider>
  </StrictMode>,
)
