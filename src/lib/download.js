/** Trigger a browser download for an in-memory blob. */
export function downloadBlob(blob, filename) {
  if (typeof window === 'undefined') return false

  const url = window.URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  window.document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser a tick to start the download before revoking the URL.
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
  return true
}
