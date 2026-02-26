import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import Shell from '@/components/layout/Shell'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import ProductsPage from '@/pages/ProductsPage'
import AssetsPage from '@/pages/AssetsPage'
import InventoryPage from '@/pages/InventoryPage'
import InvoicesPage from '@/pages/InvoicesPage'
import StatsPage from '@/pages/StatsPage'
import DistributorsPage from '@/pages/DistributorsPage'
import RetailerPage from '@/pages/RetailerPage'
import CreativesPage from '@/pages/CreativesPage'
import TrainingsPage from '@/pages/TrainingsPage'
import QuizPage from '@/pages/QuizPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
            <Route path="creatives" element={<CreativesPage />} />
            <Route path="trainings" element={<TrainingsPage />} />
            <Route path="quiz/:id" element={<QuizPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
