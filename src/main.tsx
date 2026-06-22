import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { RegistrationProvider } from './utils/regContext';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ThemeProvider } from './utils/theme';
import { I18nProvider } from './utils/i18nContext';

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
