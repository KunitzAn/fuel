export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
}

export function error(status: number, message: string): Response {
  return json({ error: message }, { status })
}

/**
 * Простая защита от cross-site POST: Origin должен совпадать с ожидаемым
 * хостом приложения (env.APP_URL), а не с хостом самого запроса — за
 * прокси/в dev-режиме (Vite на одном порту, Functions на другом) это два
 * разных хоста, хотя пользователь работает с одним и тем же приложением.
 */
export function sameOrigin(request: Request, appUrl: string): boolean {
  const origin = request.headers.get('Origin')
  if (!origin) return true // не браузерный запрос или navigation
  try {
    return new URL(origin).host === new URL(appUrl).host
  } catch {
    return false
  }
}

export async function readJson<T = unknown>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown'
}
