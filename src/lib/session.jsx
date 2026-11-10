import { createContext, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, onSessionExpired } from './api'
import {
  activateSession,
  clearAllSessions,
  isExpired,
  readSession,
  saveSession,
  subscribeSession,
} from './auth'
import { forgetWorkspace, readWorkspaces, rememberSession } from './workspaces'

const SessionContext = createContext(null)

/**
 * Central authenticated state: user, tenant, role, plan, and the workspaces this
 * device can switch between. One provider owns the `/auth/me` and `/tenants/current`
 * requests so the shell, guards, and future data pages all read the same snapshot.
 */
export function SessionProvider({ children }) {
  const navigate = useNavigate()

  const [session, setSession] = useState(readSession)
  const [profile, setProfile] = useState(null)
  const [profileStatus, setProfileStatus] = useState(session ? 'loading' : 'anonymous')
  const [profileAttempt, setProfileAttempt] = useState(0)

  const [tenantDetails, setTenantDetails] = useState(null)
  const [tenantStatus, setTenantStatus] = useState(session ? 'loading' : 'idle')
  const [tenantAttempt, setTenantAttempt] = useState(0)

  const [workspaces, setWorkspaces] = useState(readWorkspaces)
  const [switchingTo, setSwitchingTo] = useState(null)
  const [switchError, setSwitchError] = useState(null)

  // Keep the provider in sync when api.js refreshes a token or another tab
  // changes the stored session.
  useEffect(
    () =>
      subscribeSession((next) => {
        setSession(next)
        setWorkspaces(readWorkspaces())
      }),
    [],
  )

  useEffect(
    () =>
      onSessionExpired(() => {
        setSession(null)
        setProfile(null)
        setProfileStatus('anonymous')
        setTenantDetails(null)
        setTenantStatus('idle')
      }),
    [],
  )

  // Adopt a session created before remembered workspaces existed.
  useEffect(() => {
    if (!session?.tenant?.id) return
    const known = readWorkspaces().some(
      (workspace) => workspace.tenant.id === session.tenant.id,
    )
    if (!known) setWorkspaces(rememberSession(session))
  }, [session?.tenant?.id])

  useEffect(() => {
    if (!session?.accessToken || !session?.tenant?.id) {
      setProfile(null)
      setProfileStatus('anonymous')
      return undefined
    }

    const controller = new AbortController()
    setProfile(null)
    setProfileStatus('loading')

    api
      .me(controller.signal)
      .then((data) => {
        setProfile(data)
        setProfileStatus('ready')
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        if (error?.status === 401) return
        setProfileStatus('error')
      })

    return () => controller.abort()
  }, [session?.tenant?.id, profileAttempt])

  useEffect(() => {
    if (!session?.accessToken || !session?.tenant?.id) {
      setTenantDetails(null)
      setTenantStatus('idle')
      return undefined
    }

    const controller = new AbortController()
    setTenantStatus('loading')

    api
      .get('/tenants/current', { signal: controller.signal })
      .then((data) => {
        setTenantDetails(data)
        setTenantStatus('ready')
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        if (error?.status === 401) return
        setTenantStatus('error')
      })

    return () => controller.abort()
  }, [session?.tenant?.id, tenantAttempt])

  function retryProfile() {
    setProfileAttempt((attempt) => attempt + 1)
  }

  function retryTenant() {
    setTenantAttempt((attempt) => attempt + 1)
  }

  // Lets a settings screen apply the response from a successful PATCH without
  // waiting for a second round trip through the provider effect.
  function updateTenant(nextTenant) {
    if (!nextTenant) return
    setTenantDetails((current) =>
      current ? { ...current, ...nextTenant } : nextTenant,
    )
  }

  function clearSwitchError() {
    setSwitchError(null)
  }

  async function switchWorkspace(tenantId) {
    if (!session || !tenantId) return false
    if (tenantId === session.tenant?.id) {
      setSwitchError(null)
      return true
    }

    const target = readWorkspaces().find((workspace) => workspace.tenant.id === tenantId)
    if (!target) {
      setSwitchError('That workspace is no longer saved on this device. Sign in to it again.')
      return false
    }

    setSwitchingTo(tenantId)
    setSwitchError(null)

    try {
      let next

      if (isExpired(target)) {
        const pair = await api.refresh(target.refreshToken)
        if (pair?.tenant?.id !== tenantId) {
          throw new ApiError('The workspace could not be verified.', {
            status: 409,
            code: 'workspace_mismatch',
          })
        }
        next = saveSession(pair)
      } else {
        next = activateSession(target)
      }

      if (!next) {
        throw new ApiError('The workspace session is incomplete.', {
          status: 500,
          code: 'workspace_session_invalid',
        })
      }

      setProfile(null)
      setProfileStatus('loading')
      setTenantDetails(null)
      setTenantStatus('loading')
      setSession(next)
      setWorkspaces(readWorkspaces())
      navigate('/app', { replace: true })
      return true
    } catch (error) {
      if (error?.status === 401 || error?.status === 403 || error?.status === 409) {
        setWorkspaces(forgetWorkspace(tenantId))
        setSwitchError('That workspace needs you to sign in again.')
      } else {
        setSwitchError(error?.message || 'Could not switch workspace. Try again.')
      }
      return false
    } finally {
      setSwitchingTo(null)
    }
  }

  function signOut() {
    clearAllSessions()
    setSession(null)
    setProfile(null)
    setProfileStatus('anonymous')
    setTenantDetails(null)
    setTenantStatus('idle')
    setWorkspaces([])
    setSwitchingTo(null)
    setSwitchError(null)
    navigate('/login', { replace: true })
  }

  const user = profile?.user
  const tenant = profile?.tenant ?? session?.tenant ?? tenantDetails
  const role = profile?.role
  const isPlatformAdmin = Boolean(user?.is_platform_admin)

  const value = {
    session,
    user,
    tenant,
    tenantDetails,
    tenantStatus,
    planCode: tenantDetails?.plan_code ?? null,
    tenantState: tenantDetails?.status ?? null,
    role,
    isPlatformAdmin,
    profileStatus,
    profile,
    retryProfile,
    retryTenant,
    updateTenant,
    workspaces,
    switchingTo,
    switchError,
    switchWorkspace,
    clearSwitchError,
    signOut,
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside a SessionProvider')
  return context
}

