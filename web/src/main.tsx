import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import App from './App'
import {OnboardingProvider} from './Onboarding'
import {routerBasename} from './basePath'
import {RealtimeProvider} from './RealtimeProvider'
import {applyTheme, getThemePreference} from './theme'
import './styles.css'

applyTheme(getThemePreference())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename()}>
      <RealtimeProvider>
        <OnboardingProvider>
          <App />
        </OnboardingProvider>
      </RealtimeProvider>
    </BrowserRouter>
  </StrictMode>,
)
