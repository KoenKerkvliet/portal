import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import Login from './pages/Login'
import AdminLayout from './layouts/AdminLayout'
import ClientLayout from './layouts/ClientLayout'
import Dashboard from './pages/admin/Dashboard'
import Projects from './pages/admin/Projects'
import Clients from './pages/admin/Clients'
import Invoices from './pages/admin/Invoices'
// RecurringInvoices and InvoiceSettings are now integrated into Invoices and Settings pages
import Products from './pages/admin/Products'
import Quotes from './pages/admin/Quotes'
// QuoteSettings is now integrated into Settings page
import QuoteBuilder from './pages/admin/QuoteBuilder'
import InvoiceBuilder from './pages/admin/InvoiceBuilder'
import Assignments from './pages/admin/Assignments'
import Templates from './pages/admin/Templates'
import Forms from './pages/admin/Forms'
import AdminSettings from './pages/admin/Settings'
import ClientPortal from './pages/client/Portal'
import FormPage from './pages/client/FormPage'
import ClientFiles from './pages/client/Files'
import ClientQuotePage from './pages/client/QuotePage'
import ClientSettings from './pages/client/Settings'
import ClientTerms from './pages/client/Terms'
import ClientAssignmentPage from './pages/client/AssignmentPage'
import ClientInvoicePage from './pages/client/InvoicePage'
import ClientStyleguidePage from './pages/client/StyleguidePage'
import ContentPages from './pages/admin/ContentPages'
import Tickets from './pages/admin/Tickets'
import ChatLogs from './pages/admin/ChatLogs'
import Onderhoud from './pages/admin/Onderhoud'
import OnderhoudTimer from './pages/admin/OnderhoudTimer'
import Financien from './pages/admin/Financien'
import ClientContentPage from './pages/client/ContentPage'
import PunchCardShop from './pages/client/PunchCardShop'
import ClientSupport from './pages/client/Support'
import Verify from './pages/Verify'
import ResetPassword from './pages/ResetPassword'
import AccountInstellen from './pages/AccountInstellen'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function AppRoutes() {
  const { profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/bevestig" element={<Verify />} />
      <Route path="/wachtwoord-reset" element={<ResetPassword />} />
      <Route path="/account-instellen" element={<AccountInstellen />} />

      {/* Admin routes */}
      <Route path="/admin" element={
        <ProtectedRoute requiredRole="admin">
          <AdminLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="projecten" element={<Projects />} />
        <Route path="klanten" element={<Clients />} />
        <Route path="facturen" element={<Invoices />} />
        <Route path="facturen/nieuw" element={<InvoiceBuilder />} />
        <Route path="facturen/:id" element={<InvoiceBuilder />} />
        <Route path="producten" element={<Products />} />
        <Route path="offertes" element={<Quotes />} />
        <Route path="offertes/nieuw" element={<QuoteBuilder />} />
        <Route path="offertes/:id" element={<QuoteBuilder />} />
        <Route path="opdrachten" element={<Assignments />} />
        <Route path="kosten" element={<Navigate to="/admin/financien" replace />} />
        <Route path="financien" element={<Financien />} />
{/* Quote settings now in /admin/instellingen */}
        <Route path="templates" element={<Templates />} />
        <Route path="formulieren" element={<Forms />} />
        <Route path="contentpaginas" element={<ContentPages />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="chatgesprekken" element={<ChatLogs />} />
        <Route path="onderhoud" element={<Onderhoud />} />
        <Route path="onderhoud/:projectId/timer" element={<OnderhoudTimer />} />
        <Route path="instellingen" element={<AdminSettings />} />
      </Route>

      {/* Document preview routes — accessible to both clients and admins (admin uses for previewing) */}
      <Route path="/offerte/:quoteId" element={
        <ProtectedRoute>
          <div className="min-h-screen bg-gray-50 py-8 px-4">
            <ClientQuotePage />
          </div>
        </ProtectedRoute>
      } />
      <Route path="/factuur/:invoiceId" element={
        <ProtectedRoute>
          <div className="min-h-screen bg-gray-50 py-8 px-4">
            <ClientInvoicePage />
          </div>
        </ProtectedRoute>
      } />

      {/* Client routes */}
      <Route path="/" element={
        <ProtectedRoute requiredRole="client">
          <ClientLayout />
        </ProtectedRoute>
      }>
        <Route index element={<ClientPortal />} />
        <Route path="formulier/:formId" element={<FormPage />} />
        <Route path="opdracht/:assignmentId" element={<ClientAssignmentPage />} />
        <Route path="design/:type/:projectId" element={<ClientStyleguidePage />} />
        {/* Legacy route */}
        <Route path="styleguide/:projectId" element={<ClientStyleguidePage />} />
        <Route path="voorwaarden" element={<ClientTerms />} />
        <Route path="content/:slug" element={<ClientContentPage />} />
        <Route path="strippenkaart" element={<PunchCardShop />} />
        <Route path="support" element={<ClientSupport />} />
        <Route path="bestanden" element={<ClientFiles />} />
        <Route path="instellingen" element={<ClientSettings />} />
      </Route>

      {/* Redirect based on role */}
      <Route path="*" element={
        profile?.role === 'admin' ? <Navigate to="/admin" replace /> : <Navigate to="/" replace />
      } />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
