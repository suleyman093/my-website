export type PartyChatMessage = {
  id: string
  userId: string
  displayName: string
  body: string
  sentAt: string
}

function getApiBaseUrl() {
  const base = import.meta.env.VITE_API_BASE_URL
  if (typeof base === 'string' && base.trim()) {
    return base.replace(/\/$/, '')
  }

  return '/api'
}

async function requestJson<TResponse>(path: string, init?: RequestInit) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
    ...init,
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? 'Party chat request failed.')
  }

  return (await response.json()) as TResponse
}

export async function loadPartyChat(code: string) {
  const payload = await requestJson<{ messages: PartyChatMessage[] }>(
    `/parties/${code.trim().toUpperCase()}/chat`,
  )
  return payload.messages
}

export async function sendPartyChatMessage(input: {
  code: string
  userId: string
  displayName: string
  body: string
}) {
  const payload = await requestJson<{ messages: PartyChatMessage[] }>(
    `/parties/${input.code.trim().toUpperCase()}/chat`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
  return payload.messages
}
