import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Register PWA Service Worker for Offline & Mobile PWA App installation
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        registration.update()
      })
      .catch((error) => {
        console.warn('Padayon PWA Service Worker registration failed:', error)
      })

    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true
        window.location.reload()
      }
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
