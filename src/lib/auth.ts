export type AuthUser = {
  id: string
  email: string | null
  displayName: string
  isGuest: boolean
}

export type StoredMatchResult = {
  id: string
  userId: string
  totalScore: number
  roundCount: number
  roundTime: number
  mode: 'moving' | 'non-moving'
  matchType?: 'regular' | 'team-duel'
  playedAt: string
}

export type ProfileSummary = {
  user: AuthUser
  summary: {
    matchesPlayed: number
    roundsPlayed: number
    totalScore: number
    averageScore: number
    bestScore: number
    bestMode: 'moving' | 'non-moving' | null
    bestMatchType: 'regular' | 'team-duel' | null
    lastPlayedAt: string | null
    regularMatches: number
    teamDuelMatches: number
  }
  recentMatches: StoredMatchResult[]
}

export type CurrentAppState = {
  user: AuthUser | null
  route: 'room' | 'game' | 'result' | 'final-result' | null
  party: {
    code: string
    leaderId: string
    members: {
      userId: string
      displayName: string
      isGuest: boolean
      joinedAt: string
      team: 'red' | 'black'
    }[]
    settings: {
      matchType: 'regular' | 'team-duel'
      mode: 'moving' | 'non-moving'
      roundTime: string
      roundCount: string
      initialPoints: string
      damageStartRound: string
      damageIncrement: string
      teamChoiceLocked: boolean
    }
    activeMatch: any
    createdAt: string
    updatedAt: string
  } | null
}

type ApiErrorPayload = {
  error?: string
}

function getApiBaseUrl() {
  const base = import.meta.env.VITE_API_BASE_URL
  if (typeof base === 'string' && base.trim()) {
    return base.replace(/\/$/, '')
  }

  return '/api'
}

async function requestAuth<TResponse>(path: string, body?: Record<string, unknown>) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null
    throw new Error(payload?.error ?? 'Authentication request failed.')
  }

  return (await response.json()) as TResponse
}

export async function registerWithServer(input: {
  email: string
  password: string
  displayName: string
}) {
  const payload = await requestAuth<{ user: AuthUser }>('/auth/register', input)
  return payload.user
}

export async function loginWithServer(input: { email: string; password: string }) {
  const payload = await requestAuth<{ user: AuthUser }>('/auth/login', input)
  return payload.user
}

export async function createGuestUserFromServer() {
  const payload = await requestAuth<{ user: AuthUser }>('/auth/guest', {})
  return payload.user
}

export async function loadCurrentSessionUser() {
  const payload = await requestAuth<{ user: AuthUser | null }>('/auth/session')
  return payload.user
}

export async function loadCurrentAppState() {
  return requestAuth<CurrentAppState>('/me/state')
}

export async function logoutFromServer() {
  await requestAuth<{ ok: true }>('/auth/logout', {})
}

export async function loadStoredMatchHistoryForUser(_userId: string) {
  const payload = await requestAuth<{ matches: StoredMatchResult[] }>('/matches/me')
  return payload.matches
}

export async function loadProfileSummary() {
  return requestAuth<ProfileSummary>('/profile/me')
}

export async function appendStoredMatchResult(
  user: AuthUser,
  match: Omit<StoredMatchResult, 'userId'>,
) {
  if (user.isGuest) {
    return
  }

  await requestAuth<{ match: StoredMatchResult }>('/matches', {
    ...match,
  })
}

export async function loadLeaderboardEntries(windowKey: 'daily' | 'monthly' | 'all-time') {
  const response = await fetch(`${getApiBaseUrl()}/leaderboard?window=${windowKey}`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null
    throw new Error(payload?.error ?? 'Could not load leaderboard.')
  }

  return (await response.json()) as {
    entries: {
      rank: number
      name: string
      country: string
      score: number
      winRate: number
      roundsPlayed: number
      streak: number
      isCurrentUser?: boolean
    }[]
  }
}

export function generateMatchId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `MATCH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
  }

  return `MATCH-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
}
