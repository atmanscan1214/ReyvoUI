import { useEffect } from 'react'

const DEFAULT_TITLE = 'Reyvo — Outbound growth for staffing agencies'

/** Keeps the document title in sync with the current page. */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Reyvo` : DEFAULT_TITLE
  }, [title])
}
