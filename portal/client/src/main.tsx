import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { i18nReady } from './i18n'
import App from './App'
import { ThemeProvider } from './context/ThemeContext'

// Wait for the user's language to load so es/fr never flash English first.
// A failed translation load must not blank the portal — render anyway (English).
void i18nReady.catch(() => undefined).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </StrictMode>
  )
})
