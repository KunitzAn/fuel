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
    // Сбрасываем только на настоящий «не вошли» (401). Нет сети/таймаут —
    // не повод разлогинивать: оставляем то, что уже знали.
    if (err instanceof ApiError && err.status === 401) me.value = null
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
  rememberEmail(me.value.email)
}

// Почта последнего успешного входа — подставляется в форму входа на этом
// устройстве. Удобство, не данные: localStorage может быть недоступен
// (приватный режим, почищенные данные сайта) — тогда просто пустое поле.
const LAST_EMAIL_KEY = 'fuel:lastLoginEmail'

function rememberEmail(email: string): void {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email)
  } catch {
    // нет хранилища — не страшно
  }
}

export function lastLoginEmail(): string {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

export async function logout(): Promise<void> {
  await api.post('/api/auth/logout')
  me.value = null
}
