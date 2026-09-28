/** Личный токен Команды iOS (этап 5) — сырое значение сервер отдаёт только в момент выпуска. */
import { api } from './api'

export interface TokenStatus {
  exists: boolean
  createdAt: string | null
}

export function getTokenStatus(): Promise<TokenStatus> {
  return api.get<TokenStatus>('/api/tokens')
}

export function issueToken(): Promise<{ token: string; createdAt: string }> {
  return api.post<{ token: string; createdAt: string }>('/api/tokens')
}
