import { useEffect, useState } from 'react'
import { registerConfirmHost, type ConfirmRequest } from '../lib/confirm'
import { Sheet } from './Sheet'

/** Renders questions asked with askConfirm(). Mounted once, in App. */
export function ConfirmHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)

  useEffect(() => {
    registerConfirmHost(setRequest)
    return () => registerConfirmHost(null)
  }, [])

  if (!request) return null

  const answer = (ok: boolean) => {
    request.resolve(ok)
    setRequest(null)
  }

  return (
    <Sheet
      dismissible={false}
      title={request.title}
      onClose={() => answer(false)}
      footer={
        <div className="footer-row">
          <button className="btn ghost" onClick={() => answer(false)}>
            Cancelar
          </button>
          <button className={`btn grow ${request.danger ? 'danger-solid' : 'primary'}`} onClick={() => answer(true)} autoFocus>
            {request.confirmLabel}
          </button>
        </div>
      }
    >
      <p className="confirm-message">{request.message}</p>
    </Sheet>
  )
}
