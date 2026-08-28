import * as Sentry from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { RegistrationProvider } from './utils/regContext';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ThemeProvider } from './utils/theme';
import { I18nProvider } from './utils/i18nContext';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.PROD ? 'production' : 'development',
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    tracePropagationTargets: ['localhost', /^https:\/\/jhcaishui\.cn/],
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <ThemeProvider>
          <RegistrationProvider>
            <App />
          </RegistrationProvider>
        </ThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
);
