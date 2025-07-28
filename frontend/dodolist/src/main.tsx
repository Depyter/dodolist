import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StatusBar, Style } from '@capacitor/status-bar'
import './index.css'
import App from './App'
import pb from './services/pbClient'

StatusBar.setOverlaysWebView({ overlay: false })
StatusBar.setStyle({ style: Style.Light })

// Set up auth state change listener
pb.authStore.onChange(() => {
  if (pb.authStore.isValid) {
    console.log("Auth state changed - user authenticated, triggering data sync")
    window.dispatchEvent(new CustomEvent('user-authenticated'))
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
