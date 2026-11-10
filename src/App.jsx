import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ScrollToTop } from './components/ScrollToTop'
import { ToastProvider } from './components/ui'
import { HomePage } from './pages/home/HomePage'
import { RegisterPage } from './pages/register/RegisterPage'
import { LoginPage } from './pages/login/LoginPage'
import { ForgotPasswordPage } from './pages/forgot-password/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/reset-password/ResetPasswordPage'
import { InvitePage } from './pages/invite/InvitePage'
import { MfaChallengePage } from './pages/mfa/MfaChallengePage'
import { WelcomePage } from './pages/welcome/WelcomePage'
import { WelcomeLayout } from './pages/welcome/WelcomeLayout'
import { AddressPage } from './pages/welcome/AddressPage'
import { VerifyEmailPage } from './pages/welcome/VerifyEmailPage'
import { LegalPage } from './pages/legal/LegalPage'
import { NotFoundPage } from './pages/not-found/NotFoundPage'
import { AppLayout } from './pages/app/AppLayout'
import { AreaGuard } from './pages/app/AreaGuard'
import { AppNotFound, AppPlaceholder } from './pages/app/AppPlaceholder'
import { APP_AREAS, isRestrictedArea } from './pages/app/navigation'
import { UiKitPage } from './pages/app/ui-kit/UiKitPage'
import { SecurityPage } from './pages/app/security/SecurityPage'
import { SessionProvider } from './lib/session'
import './components/ui/ui.css'

const AREA_ROUTES = Object.entries(APP_AREAS).filter(
  ([key]) => key !== 'dashboard' && key !== 'security',
)

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ToastProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/invite" element={<InvitePage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route
            path="/mfa/challenge"
            element={
              <SessionProvider>
                <MfaChallengePage />
              </SessionProvider>
            }
          />
          <Route
            element={
              <SessionProvider>
                <WelcomeLayout />
              </SessionProvider>
            }
          >
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="/welcome/address" element={<AddressPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Route>
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />

          <Route
            path="/app"
            element={
              <SessionProvider>
                <AppLayout />
              </SessionProvider>
            }
          >
            <Route index element={<AppPlaceholder area={APP_AREAS.dashboard} />} />
            <Route
              path="settings/security"
              element={
                <AreaGuard area={APP_AREAS.security}>
                  <SecurityPage />
                </AreaGuard>
              }
            />
            {AREA_ROUTES.map(([key, area]) => (
              <Route
                key={key}
                path={area.path}
                element={
                  isRestrictedArea(area) ? (
                    <AreaGuard area={area}>
                      <AppPlaceholder area={area} />
                    </AreaGuard>
                  ) : (
                    <AppPlaceholder area={area} />
                  )
                }
              />
            ))}
            {import.meta.env.DEV ? (
              <Route path="ui-kit" element={<UiKitPage />} />
            ) : null}
            <Route path="*" element={<AppNotFound />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}

