import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './styles/glass.css'
import './index.css'
import { registerSW } from './lib/pwa'

registerSW()

// Обработчик стоит снаружи роутера: ошибка при разборе адреса или в самом
// App тогда тоже будет видна, а не превратится в пустой экран.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
