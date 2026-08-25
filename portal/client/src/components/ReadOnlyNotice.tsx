import { Eye } from 'lucide-react'

/**
 * Banner admin pages drop at the top when `isReadOnlyAdmin(user.role)` is
 * true (Legal / tier8). Same copy as the persistent sidebar indicator in
 * `Sidebar.tsx` — keep the two in sync if this ever changes.
 */
export default function ReadOnlyNotice() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-elevated border border-portal-border">
      <Eye className="w-4 h-4 text-portal-accent flex-shrink-0" />
      <p className="text-on-canvas-subtle text-sm">
        Read-only access — you can view everything here, but not change it.
      </p>
    </div>
  )
}
