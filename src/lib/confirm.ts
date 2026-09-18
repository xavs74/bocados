/**
 * In-app replacement for window.confirm. The browser's own dialog isn't
 * reliable in apps added to the iPhone home screen, where a tap on "Vaciar"
 * could do nothing at all. <ConfirmHost> in App renders the question.
 */
export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
  danger: boolean
  resolve: (ok: boolean) => void
}

let show: ((request: ConfirmRequest) => void) | null = null

export function registerConfirmHost(handler: ((request: ConfirmRequest) => void) | null) {
  show = handler
}

export function askConfirm(message: string, options: { title?: string; confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) {
      resolve(window.confirm(message))
      return
    }
    show({ title: options.title ?? '¿Seguro?', message, confirmLabel: options.confirmLabel ?? 'Aceptar', danger: options.danger ?? false, resolve })
  })
}
