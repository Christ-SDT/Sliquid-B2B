import { Routes, Route } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import HomePage from '@/pages/HomePage'
import OurBrandsPage from '@/pages/OurBrandsPage'
import IngredientsPage from '@/pages/IngredientsPage'
import AboutUsPage from '@/pages/AboutUsPage'
import InsightsPage from '@/pages/InsightsPage'
import ContactPage from '@/pages/ContactPage'
import PartnerLoginPage from '@/pages/PartnerLoginPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import HealthPractitionersPage from '@/pages/HealthPractitionersPage'
import ProductCatalogPage from '@/pages/ProductCatalogPage'
import MapPolicyPage from '@/pages/MapPolicyPage'
import NotFoundPage from '@/pages/NotFoundPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="our-brands" element={<OurBrandsPage />} />
        <Route path="ingredients" element={<IngredientsPage />} />
        <Route path="about" element={<AboutUsPage />} />
        <Route path="insights" element={<InsightsPage />} />
        <Route path="insights/:slug" element={<InsightsPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="partner-login" element={<PartnerLoginPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="health-practitioners" element={<HealthPractitionersPage />} />
        <Route path="catalog" element={<ProductCatalogPage />} />
        <Route path="map-policy" element={<MapPolicyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
