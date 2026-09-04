import { useEffect } from 'react'

export const SITE_NAME = 'Sliquid HQ'

/**
 * Sets `document.title` to `"<title> | Sliquid HQ"`. Pass a falsy title to
 * fall back to the bare site name (used briefly while a dynamic page's data
 * is still loading).
 *
 * WCAG 2.4.2 (Page Titled) — every route needs a title that is unique and
 * describes that page's content. Static routes get a default from
 * `getDefaultTitle` in Layout.tsx; pages with data-driven content (e.g. an
 * announcement) call this again once loaded to override it with the specific
 * title.
 */
export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_NAME
  }, [title])
}
