import { useEffect, useRef, useState, type FormEvent } from 'react'
import { productByBarcode, saveProduct, type Product } from '../lib/openFoodFacts'
import type { Food } from '../db'
import { Sheet } from './Sheet'

type Status =
  | { step: 'starting' }
  | { step: 'scanning' }
  | { step: 'looking'; code: string }
  | { step: 'unknown'; code: string }
  | { step: 'error'; message: string }

interface Props {
  onFound: (food: Food, product: Product) => void
  onCreate: (barcode: string) => void
  onClose: () => void
}

/** Camera view that reads a barcode and looks the product up in Open Food Facts. */
export function ScanSheet({ onFound, onCreate, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<Status>({ step: 'starting' })
  const [typed, setTyped] = useState('')
  const [checking, setChecking] = useState(false)
  const lookUpRef = useRef<(code: string) => Promise<void>>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let stop = false
    const seen = new Set<string>()

    async function run() {
      try {
        // The reader is ~1 MB of WebAssembly, so it's only loaded when scanning starts.
        const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
          import('barcode-detector/pure'),
          import('zxing-wasm/reader/zxing_reader.wasm?url'),
        ])
        prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } })

        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (stop) return
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setStatus({ step: 'scanning' })

        const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] })
        while (!stop) {
          const codes = await detector.detect(video).catch(() => [])
          const code = codes.find((c) => c.rawValue && !seen.has(c.rawValue))?.rawValue
          if (code) {
            seen.add(code)
            await lookUp(code)
            if (stop) return
          }
          await new Promise((r) => setTimeout(r, 250))
        }
      } catch (e) {
        if (stop) return
        const name = (e as Error)?.name
        setStatus({
          step: 'error',
          message:
            name === 'NotAllowedError'
              ? 'No has dado permiso para usar la cámara. Actívalo en los ajustes del navegador.'
              : name === 'NotFoundError'
                ? 'No se ha encontrado ninguna cámara en este dispositivo.'
                : 'No se pudo abrir la cámara en este navegador.',
        })
      }
    }

    async function lookUp(code: string) {
      setStatus({ step: 'looking', code })
      try {
        const product = await productByBarcode(code)
        if (stop) return
        if (!product) {
          setStatus({ step: 'unknown', code })
          return
        }
        const food = await saveProduct(product)
        if (!stop) onFound(food, product)
      } catch {
        if (!stop) setStatus({ step: 'error', message: 'No se pudo consultar Open Food Facts. ¿Tienes conexión?' })
      }
    }

    lookUpRef.current = lookUp
    run()
    return () => {
      stop = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onFound])

  async function lookUpTyped(e: FormEvent) {
    e.preventDefault()
    const code = typed.replace(/\D/g, '')
    if (code.length < 6) return
    setChecking(true)
    await lookUpRef.current?.(code)
    setChecking(false)
  }

  const cameraFailed = status.step === 'error'

  return (
    <Sheet title="Escanear código de barras" onClose={onClose}>
      <div className="scanner">
        <div className={`scan-view ${cameraFailed ? 'failed' : ''}`}>
          <video ref={videoRef} playsInline muted aria-label="Cámara" />
          <div className="scan-frame" aria-hidden="true" />
        </div>

        {status.step === 'starting' && <p className="hint">Abriendo la cámara…</p>}
        {status.step === 'scanning' && <p className="hint">Apunta al código de barras del producto.</p>}
        {status.step === 'looking' && <p className="hint">Buscando {status.code}…</p>}
        {status.step === 'unknown' && (
          <div className="scan-unknown">
            <p className="hint">Ese código ({status.code}) no está en Open Food Facts.</p>
            <button className="btn primary block" onClick={() => onCreate(status.code)}>
              Crear el alimento a mano
            </button>
          </div>
        )}
        {status.step === 'error' && <p className="hint warn">{status.message}</p>}

        <form className="manual-code" onSubmit={lookUpTyped}>
          <label className="field grow">
            <span>¿No lo lee? Escribe el código</span>
            <input
              inputMode="numeric"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="8480000108487"
              aria-label="Código de barras"
              autoFocus={cameraFailed}
            />
          </label>
          <button type="submit" className="btn ghost" disabled={typed.replace(/\D/g, '').length < 6 || checking}>
            {checking ? 'Buscando…' : 'Buscar'}
          </button>
        </form>
      </div>
    </Sheet>
  )
}
