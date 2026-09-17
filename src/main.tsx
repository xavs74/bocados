import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { migrateLegacyDb } from './db'
import { trackVisualViewport } from './lib/viewport'

trackVisualViewport()

// Data must be moved from the old database before any screen reads it.
migrateLegacyDb().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
