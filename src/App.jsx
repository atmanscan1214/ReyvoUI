import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ScrollToTop } from './components/ScrollToTop'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/ui'
import { HomePage } from './pages/home/HomePage'
import { RegisterPage } from './pages/register/RegisterPage'
import { LoginPage } from './pages/login/LoginPage'
import { ForgotPasswordPage } from './pages/forgot-password/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/reset-password/ResetPasswordPage'
import { ConfirmEmailChangePage } from './pages/confirm-email-change/ConfirmEmailChangePage'
import { InvitePage } from './pages/invite/InvitePage'
import { MfaChallengePage } from './pages/mfa/MfaChallengePage'
import { MfaSetupPage } from './pages/mfa/MfaSetupPage'
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
import { DashboardPage } from './pages/app/dashboard/DashboardPage'
import { ReportsPage } from './pages/app/reports/ReportsPage'
import { SecurityPage } from './pages/app/security/SecurityPage'
import { AccountPage } from './pages/app/account/AccountPage'
import { RepliesPage } from './pages/app/replies/RepliesPage'
import { ReplyDetailPage } from './pages/app/replies/ReplyDetailPage'
import { CompaniesPage } from './pages/app/companies/CompaniesPage'
import { CompanyDetailPage } from './pages/app/companies/CompanyDetailPage'
import { ContactsPage } from './pages/app/contacts/ContactsPage'
import { ContactDetailPage } from './pages/app/contacts/ContactDetailPage'
import { ImportsPage } from './pages/app/imports/ImportsPage'
import { ListsPage } from './pages/app/lists/ListsPage'
import { SuppressionsPage } from './pages/app/suppressions/SuppressionsPage'
import { MailboxesPage } from './pages/app/mailboxes/MailboxesPage'
import { MailboxDetailPage } from './pages/app/mailboxes/MailboxDetailPage'
import { MailboxHealthPage } from './pages/app/mailboxes/MailboxHealthPage'
import { AdminPage } from './pages/app/admin/AdminPage'
import { BillingPage } from './pages/app/billing/BillingPage'
import { NotificationsPage } from './pages/app/notifications/NotificationsPage'
import { WorkspaceSettingsPage } from './pages/app/settings/WorkspaceSettingsPage'
import { DataPrivacyPage } from './pages/app/settings/DataPrivacyPage'
import { TeamPage } from './pages/app/team/TeamPage'
import { CampaignsPage } from './pages/app/campaigns/CampaignsPage'
import { CampaignDetailPage } from './pages/app/campaigns/CampaignDetailPage'
import { CampaignWizardPage } from './pages/app/campaigns/CampaignWizardPage'
import { OpportunityDetailPage } from './pages/app/pipeline/OpportunityDetailPage'
import { PipelinePage } from './pages/app/pipeline/PipelinePage'
import { TasksPage } from './pages/app/tasks/TasksPage'
import { StatusPage } from './pages/status/StatusPage'
import { UnsubscribePage } from './pages/app/unsubscribe/UnsubscribePage'
import { SessionProvider } from './lib/session'
import './components/ui/ui.css'

const AREA_ROUTES = Object.entries(APP_AREAS).filter(
  ([key]) =>
    key !== 'dashboard' &&
    key !== 'security' &&
    key !== 'account' &&
    key !== 'settings' &&
    key !== 'data' &&
    key !== 'team' &&
    key !== 'companies' &&
    key !== 'contacts' &&
    key !== 'lists' &&
    key !== 'imports' &&
    key !== 'suppressions' &&
    key !== 'mailboxes' &&
    key !== 'campaigns' &&
    key !== 'notifications',
)

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ToastProvider>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/confirm-email-change" element={<ConfirmEmailChangePage />} />
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
              path="/mfa/setup"
              element={
                <SessionProvider>
                  <MfaSetupPage />
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
            <Route path="/u/:token" element={<UnsubscribePage />} />

            <Route
              path="/app"
              element={
                <SessionProvider>
                  <AppLayout />
                </SessionProvider>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route
                path="settings/security"
                element={
                  <AreaGuard area={APP_AREAS.security}>
                    <SecurityPage />
                  </AreaGuard>
                }
              />
              <Route path="settings/account" element={<AccountPage />} />
              <Route
                path="settings"
                element={
                  <AreaGuard area={APP_AREAS.settings}>
                    <WorkspaceSettingsPage />
                  </AreaGuard>
                }
              />
              <Route
                path="settings/team"
                element={
                  <AreaGuard area={APP_AREAS.team}>
                    <TeamPage />
                  </AreaGuard>
                }
              />
              <Route
                path="settings/data"
                element={
                  <AreaGuard area={APP_AREAS.data}>
                    <DataPrivacyPage />
                  </AreaGuard>
                }
              />
              <Route path="replies" element={<RepliesPage />} />
              <Route path="replies/:replyId" element={<ReplyDetailPage />} />
              <Route path="companies" element={<CompaniesPage />} />
              <Route path="companies/:companyId" element={<CompanyDetailPage />} />
              <Route path="contacts" element={<ContactsPage />} />
              <Route path="contacts/:contactId" element={<ContactDetailPage />} />
              <Route path="imports" element={<ImportsPage />} />
              <Route path="lists" element={<ListsPage />} />
              <Route path="suppressions" element={<SuppressionsPage />} />
              <Route path="mailboxes" element={<MailboxesPage />} />
              <Route path="mailboxes/health" element={<MailboxHealthPage />} />
              <Route path="mailboxes/:mailboxId" element={<MailboxDetailPage />} />
              <Route
                path="billing"
                element={
                  <AreaGuard area={APP_AREAS.billing}>
                    <BillingPage />
                  </AreaGuard>
                }
              />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="status" element={<StatusPage />} />
              <Route
                path="admin"
                element={
                  <AreaGuard area={APP_AREAS.admin}>
                    <AdminPage />
                  </AreaGuard>
                }
              />
              <Route path="campaigns" element={<CampaignsPage />} />
              <Route path="campaigns/:campaignId" element={<CampaignDetailPage />} />
              <Route path="campaigns/new" element={<CampaignWizardPage />} />
              <Route path="pipeline" element={<PipelinePage />} />
              <Route path="pipeline/:opportunityId" element={<OpportunityDetailPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="tasks" element={<TasksPage />} />
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
        </ErrorBoundary>
      </ToastProvider>
    </BrowserRouter>
  )
}

