import type { AuthUser } from './auth'

export type MatchType = 'regular' | 'team-duel'
export type CameraMode = 'moving' | 'non-moving'
export type TeamId = 'red' | 'black'

export type PartyTargetView = {
  lat: number
  lng: number
  heading: number
  pitch: number
  panoId?: string | null
}

export type PartySettings = {
  matchType: MatchType
  mode: CameraMode
  roundTime: string
  roundCount: string
  initialPoints: string
  damageStartRound: string
  damageIncrement: string
  teamChoiceLocked: boolean
}

export type PartyMember = {
  userId: string
  displayName: string
  isGuest: boolean
  joinedAt: string
  team: TeamId
}

export type PartyRoundSubmission = {
  userId: string
  guess: {
    lat: number
    lng: number
  } | null
  timedOut: boolean
  submittedAt: string
}

export type PartyRoundStanding = {
  userId: string
  displayName: string
  team: TeamId
  guessed: boolean
  distanceKm: number
  score: number
  placement: number
  guessPosition: {
    lat: number
    lng: number
  } | null
}

export type PartyTeamSnapshot = {
  redPoints: number
  blackPoints: number
  redDistanceKm: number | null
  blackDistanceKm: number | null
  redRoundScore: number
  blackRoundScore: number
  redChosenUserId: string | null
  blackChosenUserId: string | null
  redChosenDisplayName: string | null
  blackChosenDisplayName: string | null
  redGuessPosition: {
    lat: number
    lng: number
  } | null
  blackGuessPosition: {
    lat: number
    lng: number
  } | null
  roundDamage: number
  multiplier: number
  winningTeam: TeamId | null
}

export type PartyRoundResult = {
  roundNumber: number
  targetId: string
  targetName: string
  targetLat: number
  targetLng: number
  standings: PartyRoundStanding[]
  teamSnapshot: PartyTeamSnapshot | null
}

export type PartyMatchState = {
  matchId: string
  status: 'playing' | 'reveal' | 'finished'
  currentRound: number
  matchType: MatchType
  mode: CameraMode
  roundTime: string
  roundCount: string
  targetId: string
  targetName: string
  targetView: PartyTargetView
  usedTargetIds: string[]
  roundStartedAt: string
  submissions: PartyRoundSubmission[]
  totalScores: Record<string, number>
  roundResults: PartyRoundResult[]
  initialPoints: number
  damageStartRound: number
  damageIncrement: number
  teamChoiceLocked: boolean
  teamPoints: Record<TeamId, number>
  winnerTeam: TeamId | null
  updatedAt: string
}

export type Party = {
  code: string
  leaderId: string
  members: PartyMember[]
  settings: PartySettings
  activeMatch: PartyMatchState | null
  chatMessages?: {
    id: string
    userId: string
    displayName: string
    body: string
    sentAt: string
  }[]
  createdAt: string
  updatedAt: string
}

type RevealSnapshot = {
  target: {
    id: string
    name: string
    lat: number
    lng: number
  }
  standings: PartyRoundStanding[]
  totals: Record<string, number>
  teamPoints: Record<TeamId, number>
  winnerTeam: TeamId | null
  roundResult: PartyRoundResult
}

type PartyStreamPayload = {
  code: string
  deleted: boolean
  party: Party | null
}

function getApiBaseUrl() {
  const base = import.meta.env.VITE_API_BASE_URL
  if (typeof base === 'string' && base.trim()) {
    return base.replace(/\/$/, '')
  }

  return '/api'
}

function getEventSourceUrl(path: string) {
  const base = getApiBaseUrl()

  if (base.startsWith('http://') || base.startsWith('https://')) {
    return `${base}${path}`
  }

  return `${window.location.origin}${base}${path}`
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
    throw new Error(payload?.error ?? 'Party request failed.')
  }

  return (await response.json()) as TResponse
}

export async function getParty(code: string) {
  if (!code.trim()) {
    return null
  }

  try {
    const payload = await requestJson<{ party: Party }>(`/parties/${code.trim().toUpperCase()}`)
    return payload.party
  } catch {
    return null
  }
}

export function subscribeToParty(
  code: string,
  handlers: {
    onParty: (party: Party | null, deleted: boolean) => void
    onError?: () => void
  },
) {
  const normalizedCode = code.trim().toUpperCase()
  const stream = new EventSource(getEventSourceUrl(`/parties/${normalizedCode}/stream`))

  function handlePartyEvent(event: MessageEvent<string>) {
    try {
      const payload = JSON.parse(event.data) as PartyStreamPayload
      handlers.onParty(payload.party, payload.deleted)
    } catch {
      handlers.onError?.()
    }
  }

  stream.addEventListener('party', handlePartyEvent as EventListener)
  stream.onerror = () => {
    handlers.onError?.()
  }

  return () => {
    stream.removeEventListener('party', handlePartyEvent as EventListener)
    stream.close()
  }
}

export async function createParty(user: AuthUser, settings: PartySettings) {
  const payload = await requestJson<{ party: Party }>('/parties/create', {
    method: 'POST',
    body: JSON.stringify({ user, settings }),
  })
  return payload.party
}

export async function joinParty(code: string, user: AuthUser) {
  const payload = await requestJson<{ party: Party }>('/parties/join', {
    method: 'POST',
    body: JSON.stringify({ code, user }),
  })
  return payload.party
}

export async function changePartyTeam(code: string, userId: string, team: TeamId) {
  const payload = await requestJson<{ party: Party }>('/parties/team/self', {
    method: 'POST',
    body: JSON.stringify({ code, userId, team }),
  })
  return payload.party
}

export async function assignPartyTeam(
  code: string,
  leaderId: string,
  memberId: string,
  team: TeamId,
) {
  const payload = await requestJson<{ party: Party }>('/parties/team/assign', {
    method: 'POST',
    body: JSON.stringify({ code, leaderId, memberId, team }),
  })
  return payload.party
}

export async function updatePartySettings(
  code: string,
  leaderId: string,
  settings: PartySettings,
) {
  const payload = await requestJson<{ party: Party }>('/parties/settings', {
    method: 'POST',
    body: JSON.stringify({ code, leaderId, settings }),
  })
  return payload.party
}

export async function kickPartyMember(code: string, leaderId: string, memberId: string) {
  const payload = await requestJson<{ party: Party }>('/parties/kick', {
    method: 'POST',
    body: JSON.stringify({ code, leaderId, memberId }),
  })
  return payload.party
}

export async function leaveParty(code: string, userId: string) {
  const payload = await requestJson<{ party: Party | null }>('/parties/leave', {
    method: 'POST',
    body: JSON.stringify({ code, userId }),
  })
  return payload.party
}

export async function startPartyMatch(code: string, leaderId: string) {
  const payload = await requestJson<{ party: Party }>('/parties/start', {
    method: 'POST',
    body: JSON.stringify({ code, leaderId }),
  })
  return payload.party
}

export async function submitPartyGuess(
  code: string,
  userId: string,
  guess: { lat: number; lng: number } | null,
  timedOut: boolean,
) {
  const payload = await requestJson<{ party: Party }>('/parties/submit', {
    method: 'POST',
    body: JSON.stringify({ code, userId, guess, timedOut }),
  })
  return payload.party
}

export async function revealPartyRound(code: string) {
  const payload = await requestJson<{ party: Party }>('/parties/reveal', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  return payload.party
}

export async function advancePartyMatch(code: string, leaderId: string) {
  const payload = await requestJson<{ party: Party }>('/parties/advance', {
    method: 'POST',
    body: JSON.stringify({ code, leaderId }),
  })
  return payload.party
}

export async function getPartyRevealSnapshot(code: string) {
  const payload = await requestJson<{ snapshot: RevealSnapshot }>(`/parties/${code.trim().toUpperCase()}/reveal`)
  return payload.snapshot
}

export function formatTeamName(team: TeamId) {
  return team === 'red' ? 'Red' : 'Black'
}
