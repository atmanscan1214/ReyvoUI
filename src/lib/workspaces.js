const STORAGE_KEY = 'reyvo.workspaces.v1'
const MAX_WORKSPACES = 8

/**
 * Workspace sessions remembered on this device.
 *
 * The API issues tenant-scoped access/refresh token pairs and has no
 * list/switch endpoint, so the only way to move between workspaces without a
 * full page reload is to keep the pair for each workspace that has signed in
 * here. Signing out clears the list.
 */
function isWorkspace(value) {
  return Boolean(value?.accessToken && value?.tenant?.id)
}

function storageWorkspace(session) {
  return {
    tenant: {
      id: session.tenant.id,
      name: session.tenant.name ?? 'Workspace',
      slug: session.tenant.slug ?? '',
    },
    accessToken: session.accessToken,
    refreshToken: session.refreshToken ?? null,
    tokenType: session.tokenType ?? 'bearer',
    expiresIn: session.expiresIn ?? null,
    obtainedAt: session.obtainedAt ?? Date.now(),
  }
}

function writeWorkspaces(workspaces) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces))
  } catch {
    // Storage can be unavailable; switching then falls back to the active session.
  }
}

export function readWorkspaces() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isWorkspace)
  } catch {
    return []
  }
}

/** Adds or refreshes a workspace entry, most recent first. */
export function rememberSession(session) {
  if (!isWorkspace(session)) return readWorkspaces()

  const next = [
    storageWorkspace(session),
    ...readWorkspaces().filter((workspace) => workspace.tenant.id !== session.tenant.id),
  ].slice(0, MAX_WORKSPACES)

  writeWorkspaces(next)
  return next
}

export function forgetWorkspace(tenantId) {
  const next = readWorkspaces().filter((workspace) => workspace.tenant.id !== tenantId)
  writeWorkspaces(next)
  return next
}

export function clearWorkspaces() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
