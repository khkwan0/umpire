import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import App from './App'
import {AuthProvider} from './auth'
import {OnboardingProvider} from './Onboarding.tsx'
import {routerBasename} from './basePath'
import {RealtimeProvider} from './RealtimeProvider'
import {applyTheme, getThemePreference} from './theme'
import './styles.css'

applyTheme(getThemePreference())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename()}>
      <AuthProvider>
        <RealtimeProvider>
          <OnboardingProvider>
            <App />
          </OnboardingProvider>
        </RealtimeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
