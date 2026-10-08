// Вход по Face ID (passkey) — перенесено из daylens как есть, там проверено
// на телефоне. Криптография — @simplewebauthn, своей нет.
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser'
import { api } from './api'
import { authChecked, me, signedOut, type Me } from './auth'

export interface PasskeyInfo {
  id: string
  label: string | null
  createdAt: string
  lastUsedAt: string | null
}

/**
 * Есть ли на устройстве встроенный аутентификатор (Face ID / Touch ID /
 * Windows Hello). Спрашиваем именно про платформенный, а не про WebAuthn
 * вообще: предлагать «вход по Face ID» там, где его нет, — обещание, которое
 * мы не сдержим.
 */
export async function passkeyAvailable(): Promise<boolean> {
  if (!browserSupportsWebAuthn()) return false
  try {
    return await platformAuthenticatorIsAvailable()
  } catch {
    return false
  }
}

/** Отмена пользователем — это не ошибка: он просто передумал прикладывать палец. */
export class PasskeyCancelled extends Error {}

function isCancel(err: unknown): boolean {
  const name = (err as { name?: string })?.name
  return name === 'NotAllowedError' || name === 'AbortError'
}

export async function registerPasskey(): Promise<void> {
  const { options } = await api.post<{ options: Record<string, unknown> }>(
    '/api/passkeys/register-options',
    {},
  )
  let response
  try {
    response = await startRegistration({ optionsJSON: options as never })
  } catch (err) {
    if (isCancel(err)) throw new PasskeyCancelled()
    throw err
  }
  await api.post('/api/passkeys/register-verify', { response })
}

export async function loginWithPasskey(): Promise<Me> {
  const { options } = await api.post<{ options: Record<string, unknown> }>(
    '/api/auth/passkey-options',
    {},
  )
  let response
  try {
    response = await startAuthentication({ optionsJSON: options as never })
  } catch (err) {
    if (isCancel(err)) throw new PasskeyCancelled()
    throw err
  }
  const user = await api.post<Me>('/api/auth/passkey-verify', { response })
  // Сессия уже выдана кукой — обновляем состояние, чтобы экраны не ждали
  // отдельной проверки.
  me.value = user
  authChecked.value = true
  signedOut.value = false // охрана маршрутов (router.ts) больше не держит на входе
  return user
}

export async function listPasskeys(): Promise<PasskeyInfo[]> {
  const { passkeys } = await api.get<{ passkeys: PasskeyInfo[] }>('/api/passkeys')
  return passkeys
}

export async function removePasskey(id: string): Promise<void> {
  await api.del('/api/passkeys', { id })
}
