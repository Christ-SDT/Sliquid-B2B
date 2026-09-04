import { useEffect } from 'react'

export const SITE_NAME = 'Sliquid Partner Portal'

/**
 * Sets `document.title` to `"<title> | Sliquid Partner Portal"`. Pass a
 * falsy title to fall back to the bare site name (used briefly while a
 * dynamic page's data is still loading).
 *
 * WCAG 2.4.2 (Page Titled), part of the accessibility remediation plan's
 * HQ 03/HQ 08 items — every route (authenticated ones included) needs a
 * title that is unique and describes that page's content. Shell.tsx sets a
 * default from `getDefaultTitle` for routes nested under it; standalone
 * routes (login, register, password reset, certificate verify) call this
 * directly. Pages with data-driven content (an announcement, a quiz) call it
 * again once loaded to override the generic default.
 */
export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_NAME
  }, [title])
}
