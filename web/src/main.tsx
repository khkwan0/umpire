import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import App from './App'
import {RealtimeProvider} from './RealtimeProvider'
import {applyTheme, getThemePreference} from './theme'
import './styles.css'

applyTheme(getThemePreference())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <RealtimeProvider>
        <App />
      </RealtimeProvider>
    </BrowserRouter>
  </StrictMode>,
)
