import { useCallback } from 'react'
import { api } from '../backend/api'
import { useIdentity } from '../identity/context'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Calls `/api/admin/...` as the Administrator signed in. */
export function useAdminApi(): <T>(path: string, options?: { method?: Method; body?: unknown }) => Promise<T> {
  const { token } = useIdentity()
  return useCallback(
    <T,>(path: string, options: { method?: Method; body?: unknown } = {}) => api<T>(`/admin${path}`, { token, ...options }),
    [token],
  )
}
