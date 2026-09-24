import { ref } from 'vue'
import { api, ApiError } from './api'

export interface Me {
  userId: number
  email: string
}

// Модульный синглтон-стейт — сессия одна на всё приложение,
// Pinia ради одного объекта не нужна.
export const me = ref<Me | null>(null)
export const authChecked = ref(false)

export async function checkSession(): Promise<Me | null> {
  try {
    me.value = await api.get<Me>('/api/me')
  } catch (err) {
    me.value = err instanceof ApiError && err.status === 401 ? null : null
  } finally {
    authChecked.value = true
  }
  return me.value
}

export async function requestLoginCode(email: string): Promise<void> {
  await api.post('/api/auth/request-code', { email })
}

export async function verifyLoginCode(email: string, code: string): Promise<void> {
  me.value = await api.post<Me>('/api/auth/verify-code', { email, code })
  authChecked.value = true
}

export async function logout(): Promise<void> {
  await api.post('/api/auth/logout')
  me.value = null
}
