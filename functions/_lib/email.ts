import type { Env } from './env'

export async function sendLoginCodeEmail(env: Env, to: string, code: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.LOGIN_EMAIL_FROM,
      to: [to],
      subject: `${code} — код входа в Fuel`,
      // Намеренно без ссылок: почтовые сервисы оборачивают ссылки в
      // click-tracking редиректы, которые иногда рвутся сами по себе.
      // Код вводится руками — ломать нечему.
      html: `
        <p>Код для входа в Fuel (действует 15 минут):</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 4px;">${code}</p>
        <p>Если вы не запрашивали вход — просто проигнорируйте это письмо.</p>
      `,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend: ${res.status} ${body}`)
  }
}
