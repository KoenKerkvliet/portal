import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import Login from './pages/Login'
import AdminLayout from './layouts/AdminLayout'
import ClientLayout from './layouts/ClientLayout'
import Dashboard from './pages/admin/Dashboard'
import Projects from './pages/admin/Projects'
import Clients from './pages/admin/Clients'
import Invoices from './pages/admin/Invoices'
import RecurringInvoices from './pages/admin/RecurringInvoices'
import InvoiceSettings from './pages/admin/InvoiceSettings'
import Products from './pages/admin/Products'
import Quotes from './pages/admin/Quotes'
import QuoteSettings from './pages/admin/QuoteSettings'
import Templates from './pages/admin/Templates'
import Forms from './pages/admin/Forms'
import AdminSettings from './pages/admin/Settings'
import ClientPortal from './pages/client/Portal'
import FormPage from './pages/client/FormPage'
import ClientFiles from './pages/client/Files'
import ClientSettings from './pages/client/Settings'
import Verify from './pages/Verify'

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
        <Route path="facturen/terugkerend" element={<RecurringInvoices />} />
        <Route path="facturen/instellingen" element={<InvoiceSettings />} />
        <Route path="producten" element={<Products />} />
        <Route path="offertes" element={<Quotes />} />
        <Route path="offertes/instellingen" element={<QuoteSettings />} />
        <Route path="templates" element={<Templates />} />
        <Route path="formulieren" element={<Forms />} />
        <Route path="instellingen" element={<AdminSettings />} />
      </Route>

      {/* Client routes */}
      <Route path="/" element={
        <ProtectedRoute requiredRole="client">
          <ClientLayout />
        </ProtectedRoute>
      }>
        <Route index element={<ClientPortal />} />
        <Route path="formulier/:formId" element={<FormPage />} />
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
    <BrowserRouter basename="/portal">
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
