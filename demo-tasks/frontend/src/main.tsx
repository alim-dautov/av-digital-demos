import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { UnseenTasksProvider } from './lib/unseenTasks'
import { UrgentNoticeProvider } from './lib/urgentNotice'
import { applyTheme } from './lib/theme'
import './index.css'

applyTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <UnseenTasksProvider>
          <UrgentNoticeProvider>
            <App />
          </UrgentNoticeProvider>
        </UnseenTasksProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
