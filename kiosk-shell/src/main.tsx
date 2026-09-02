import { createRoot } from 'react-dom/client'
import '@chaos-ops-de/design/web.css'
import { ThemeProvider, CssVariables, memoryStorage } from '@chaos-ops-de/design'
import { App } from './App'

// A kiosk has no user to remember a theme preference for, so we use in-memory
// storage and pin a light scheme (the ChaosOps display routes force their own
// scheme anyway once we hand off to them). CssVariables injects the palette as
// CSS custom properties the design system's web styles read.
createRoot(document.getElementById('root')!).render(
  <ThemeProvider storage={memoryStorage} systemScheme="light">
    <CssVariables />
    <App />
  </ThemeProvider>,
)
