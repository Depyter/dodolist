import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StatusBar, Style } from '@capacitor/status-bar'
import './index.css'
import App from './App'
import PocketBase from 'pocketbase'
import { PB_URL } from './config'

StatusBar.setOverlaysWebView({ overlay: false })
StatusBar.setStyle({ style: Style.Light })

// Set up auth state change listener
const pb = new PocketBase(PB_URL)
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
