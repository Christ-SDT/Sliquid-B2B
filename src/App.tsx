import { Routes, Route } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import HomePage from '@/pages/HomePage'
import OurBrandsPage from '@/pages/OurBrandsPage'
import IngredientsPage from '@/pages/IngredientsPage'
import AboutUsPage from '@/pages/AboutUsPage'
import InsightsPage from '@/pages/InsightsPage'
import ContactPage from '@/pages/ContactPage'
import PartnerLoginPage from '@/pages/PartnerLoginPage'
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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
