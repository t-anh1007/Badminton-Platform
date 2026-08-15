import { useEffect, useRef } from 'react'

interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void
  disabled?: boolean
}

interface GoogleIdConfig {
  client_id: string
  callback: (response: { credential: string }) => void
  auto_select?: boolean
  cancel_on_tap_outside?: boolean
}

interface GoogleButtonOptions {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  width?: number
  logo_alignment?: 'left' | 'center'
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdConfig) => void
          renderButton: (element: HTMLElement, options: GoogleButtonOptions) => void
        }
      }
    }
  }
}

const SCRIPT_ID = 'google-identity-services'
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(SCRIPT_ID)) return resolve()
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Không tải được Google Identity Services.'))
    document.head.appendChild(script)
  })
}

export function GoogleSignInButton({ onCredential, disabled }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined

  useEffect(() => {
    if (!clientId || !containerRef.current) return
    let cancelled = false
    loadGsiScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response?.credential) onCredential(response.credential)
          },
        })
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 320,
        })
      })
      .catch(() => {
        // Cứ để trống — component render lỗi text bên dưới sẽ hiện.
      })
    return () => {
      cancelled = true
    }
  }, [clientId, onCredential])

  if (!clientId) {
    return (
      <p className="text-xs text-ink-500">
        Đăng nhập Google chưa được cấu hình (thiếu <code>VITE_GOOGLE_OAUTH_CLIENT_ID</code>).
      </p>
    )
  }

  return (
    <div
      ref={containerRef}
      aria-label="Đăng nhập bằng Google"
      className={disabled ? 'pointer-events-none opacity-60' : undefined}
    />
  )
}
