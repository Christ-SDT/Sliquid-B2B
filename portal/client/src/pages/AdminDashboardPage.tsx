import { useAuth } from '@/context/AuthContext'
import { isAdmin, isReadOnlyAdmin } from '@/types'
import ReadOnlyNotice from '@/components/ReadOnlyNotice'
import ConnectionsPanel from '@/components/admin/ConnectionsPanel'
import WooPanel from '@/components/admin/WooPanel'
import RewardItemsPanel from '@/components/admin/RewardItemsPanel'
import RewardOrdersSummaryCard from '@/components/admin/RewardOrdersSummaryCard'
import WordPressPanel from '@/components/admin/WordPressPanel'
import AiModelPanel from '@/components/admin/AiModelPanel'
import SsoNotificationsPanel from '@/components/admin/SsoNotificationsPanel'
import { SectionHeading } from '@/components/admin/dashboardUi'
import { Bell, Cpu, Gauge, Newspaper, ShoppingCart } from 'lucide-react'

/**
 * /admin/dashboard — every external connection in one place, plus the
 * WooCommerce / WordPress add-on settings. Legal (tier8) sees all of it
 * read-only: write controls are hidden (not disabled) when !canEdit, and the
 * server rejects the writes regardless.
 */
export default function AdminDashboardPage() {
  const { user } = useAuth()
  const role = user?.role ?? ''
  const canEdit = isAdmin(role)
  const readOnly = isReadOnlyAdmin(role)

  return (
    <div className="max-w-7xl mx-auto space-y-10 min-w-0">
      {readOnly && <ReadOnlyNotice />}

      <header>
        <h1 className="text-on-canvas text-2xl font-bold flex items-center gap-3">
          <Gauge className="w-6 h-6 text-portal-accent flex-shrink-0" aria-hidden="true" />
          Admin Dashboard
        </h1>
        <p className="text-on-canvas-subtle text-sm mt-1">
          Status and tests for every external connection, and the settings for the WooCommerce and WordPress add-ons.
        </p>
      </header>

      <ConnectionsPanel canEdit={canEdit} />

      <section aria-labelledby="woo-heading" className="space-y-4">
        <SectionHeading
          id="woo-heading"
          icon={ShoppingCart}
          title="WooCommerce"
          description="Store credentials and inventory sync, the reward T-shirt and pin, and reward order status."
        />
        <WooPanel canEdit={canEdit} />
        <RewardOrdersSummaryCard />
        <RewardItemsPanel canEdit={canEdit} />
      </section>

      <section aria-labelledby="wp-heading" className="space-y-4">
        <SectionHeading
          id="wp-heading"
          icon={Newspaper}
          title="WordPress announcements"
          description="Where press releases are pulled from, and when."
        />
        <WordPressPanel canEdit={canEdit} />
      </section>

      <section aria-labelledby="ai-heading" className="space-y-4">
        <SectionHeading
          id="ai-heading"
          icon={Cpu}
          title="AI image model"
          description="The model the Creator uses to generate images."
        />
        <AiModelPanel canEdit={canEdit} />
      </section>

      <section aria-labelledby="sso-notify-heading" className="space-y-4">
        <SectionHeading
          id="sso-notify-heading"
          icon={Bell}
          title="SSO notifications"
          description="Relay portal events to Sliquid staff in the SSO portal, routed by event type."
        />
        <SsoNotificationsPanel canEdit={canEdit} />
      </section>
    </div>
  )
}
