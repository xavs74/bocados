import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted so the app keeps its type offline and asks nothing of Google's servers.
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/fraunces'
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
