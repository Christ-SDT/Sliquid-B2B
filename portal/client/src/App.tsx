import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import Shell from '@/components/layout/Shell'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import DashboardPage from '@/pages/DashboardPage'
import ProductsPage from '@/pages/ProductsPage'
import AssetsPage from '@/pages/AssetsPage'
import InventoryPage from '@/pages/InventoryPage'
import InvoicesPage from '@/pages/InvoicesPage'
import StatsPage from '@/pages/StatsPage'
import DistributorsPage from '@/pages/DistributorsPage'
import RetailerPage from '@/pages/RetailerPage'
import TrainingsPage from '@/pages/TrainingsPage'
import QuizPage from '@/pages/QuizPage'
import UsersPage from '@/pages/UsersPage'
import StoreUsersPage from '@/pages/StoreUsersPage'
import RequestsPage from '@/pages/RequestsPage'
import MarketingRequestsPage from '@/pages/MarketingRequestsPage'
import CertificateVerify from '@/pages/CertificateVerify'
import CreatorPage from '@/pages/CreatorPage'
import MediaPage from '@/pages/MediaPage'
import ReferenceGalleryPage from '@/pages/ReferenceGalleryPage'
import LogsPage from '@/pages/LogsPage'
import MedicalMarketingPage from '@/pages/MedicalMarketingPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/" element={<Shell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="assets" element={<AssetsPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="distributors" element={<DistributorsPage />} />
            <Route path="retailer" element={<RetailerPage />} />
            <Route path="trainings" element={<TrainingsPage />} />
            <Route path="quiz/:id" element={<QuizPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="requests" element={<RequestsPage />} />
            <Route path="marketing-requests" element={<MarketingRequestsPage />} />
            <Route path="store-users" element={<StoreUsersPage />} />
            <Route path="creator" element={<CreatorPage />} />
            <Route path="media" element={<MediaPage />} />
            <Route path="reference-gallery" element={<ReferenceGalleryPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="medical-marketing" element={<MedicalMarketingPage />} />
          </Route>
          <Route path="/verify" element={<CertificateVerify />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
