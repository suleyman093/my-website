import { useEffect, useMemo, useState } from 'react'
import { GuessMiniMap } from '../components/GuessMiniMap'
import { StreetViewPanel } from '../components/StreetViewPanel'
import { useAuth } from '../lib/AuthContext'
import { loadCurrentAppState } from '../lib/auth'
import {
  buildFinalMatchStateFromParty,
  buildGameRouteStateFromParty,
  buildResultRouteStateFromParty,
} from '../lib/matchResume'
import { sendPartyChatMessage } from '../lib/partyChat'
import {
  formatTeamName,
  getParty,
  leaveParty,
  revealPartyRound,
  subscribeToParty,
  submitPartyGuess,
} from '../lib/party'
import type { Party, PartyTargetView } from '../lib/party'
import { roundTargets } from '../lib/roundTargets'
import { useLocation, useNavigate } from 'react-router-dom'

type GameSettings = {
  matchType?: 'regular' | 'team-duel'
  mode: 'moving' | 'non-moving'
  roundTime: string
  roundCount: string
  currentRound?: number
  targetId?: string
  targetName?: string
  targetView?: PartyTargetView
  runningTotalScore?: number
  usedTargetIds?: string[]
  roundResults?: {
    roundNumber: number
    targetName: string
    distanceKm: number
    score: number
    guessed: boolean
  }[]
  partyCode?: string
}

type GuessCoords = {
  lat: number
  lng: number
} | null

function pickRoundTarget(targetId: string | undefined, usedTargetIds: string[]) {
  if (targetId) {
    const existing = roundTargets.find((item) => item.id === targetId)
    if (existing) {
      return existing
    }
  }

  const availableTargets = roundTargets.filter(
    (item) => !usedTargetIds.includes(item.id),
  )
  const source = availableTargets.length > 0 ? availableTargets : roundTargets
  return source[Math.floor(Math.random() * source.length)]
}

function toTargetView(target: {
  id?: string
  name?: string
  lat: number
  lng: number
  heading?: number
  pitch?: number
  panoId?: string | null
}) {
  return {
    id: target.id ?? 'current-round',
    name: target.name ?? 'Current location',
    lat: target.lat,
    lng: target.lng,
    heading: target.heading ?? 34,
    pitch: target.pitch ?? 8,
    panoId: target.panoId ?? null,
  }
}

function toCurrentUserRoundResults(party: Party, userId: string | undefined) {
  return (party.activeMatch?.roundResults ?? []).map((round) => {
    const standing =
      round.standings.find((entry) => entry.userId === userId) ?? null

    return {
      roundNumber: round.roundNumber,
      targetName: round.targetName,
      distanceKm: standing?.distanceKm ?? 0,
      score: standing?.score ?? 0,
      guessed: standing?.guessed ?? false,
    }
  })
}

function formatTimeLeft(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

export function GamePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [chatHidden, setChatHidden] = useState(false)
  const [guess, setGuess] = useState<GuessCoords>(null)
  const [submitted, setSubmitted] = useState(false)
  const [party, setParty] = useState<Party | null>(null)
  const [chatMessages, setChatMessages] = useState<
    {
      id: string
      userId: string
      displayName: string
      body: string
      sentAt: string
    }[]
  >([])
  const [chatInput, setChatInput] = useState('')

  const settings = (location.state as GameSettings | null) ?? {
    matchType: 'regular',
    mode: 'moving',
    roundTime: '60',
    roundCount: '5',
    currentRound: 1,
    runningTotalScore: 0,
    usedTargetIds: [],
  }

  const partyCode = settings.partyCode
  const isPartyMatch = Boolean(partyCode && user)

  useEffect(() => {
    if (!user || partyCode) {
      return
    }

    const currentUser = user
    let cancelled = false

    async function resumeWithoutCode() {
      try {
        const appState = await loadCurrentAppState()
        if (cancelled || !appState.party || !appState.route) {
          return
        }

        if (appState.route === 'room') {
          navigate('/room', { state: { partyCode: appState.party.code } })
          return
        }

        if (appState.route === 'game') {
          const nextState = buildGameRouteStateFromParty(appState.party, currentUser.id)
          if (nextState) {
            navigate('/game', { state: nextState })
          }
          return
        }

        if (appState.route === 'result') {
          const nextState = buildResultRouteStateFromParty(appState.party, currentUser.id)
          if (nextState) {
            navigate('/result', { state: nextState })
          }
          return
        }

        if (appState.route === 'final-result') {
          navigate('/final-result', {
            state: buildFinalMatchStateFromParty(appState.party, currentUser.id),
          })
        }
      } catch {}
    }

    void resumeWithoutCode()

    return () => {
      cancelled = true
    }
  }, [navigate, partyCode, user])

  useEffect(() => {
    if (!partyCode) {
      setParty(null)
      return
    }

    const currentPartyCode = partyCode
    let cancelled = false

    async function refreshParty() {
      const nextParty = await getParty(currentPartyCode)
      if (!cancelled) {
        setParty(nextParty)
      }
    }

    void refreshParty()
    const unsubscribe = subscribeToParty(currentPartyCode, {
      onParty(nextParty, deleted) {
        if (cancelled) {
          return
        }

        if (deleted) {
          setParty(null)
          return
        }

        setParty(nextParty)
      },
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [partyCode])

  useEffect(() => {
    if (!partyCode) {
      setChatMessages([
        {
          id: 'solo-note',
          userId: 'system',
          displayName: 'System',
          body: 'Solo match. Party chat appears when you are in a lobby.',
          sentAt: new Date().toISOString(),
        },
      ])
      return
    }

    setChatMessages(party?.chatMessages ?? [])
  }, [party?.chatMessages, partyCode])

  const activeMatch = party?.activeMatch ?? null
  const chatPreferenceKey = `myn-chat-hidden:${activeMatch?.matchId ?? partyCode ?? 'solo-current'}`
  const currentRound = activeMatch?.currentRound ?? settings.currentRound ?? 1
  const totalRounds = Number(activeMatch?.roundCount ?? settings.roundCount)
  const runningTotalScore =
    activeMatch?.totalScores[user?.id ?? ''] ?? settings.runningTotalScore ?? 0
  const usedTargetIds = activeMatch?.usedTargetIds ?? settings.usedTargetIds ?? []
  const roundResults =
    party && user
      ? toCurrentUserRoundResults(party, user.id)
      : settings.roundResults ?? []
  const partyMembers = party?.members ?? []
  const matchType = activeMatch?.matchType ?? settings.matchType ?? 'regular'
  const teamPoints = activeMatch?.teamPoints ?? null
  const currentMember = partyMembers.find((member) => member.userId === user?.id) ?? null
  const [timeLeft, setTimeLeft] = useState(
    Number(activeMatch?.roundTime ?? settings.roundTime),
  )
  const mode = activeMatch?.mode ?? settings.mode

  const target = useMemo(() => {
    if (activeMatch?.targetView) {
      return toTargetView({
        id: activeMatch.targetId,
        name: activeMatch.targetName,
        ...activeMatch.targetView,
      })
    }

    if (settings.targetView) {
      return toTargetView({
        id: settings.targetId,
        name: settings.targetName,
        ...settings.targetView,
      })
    }

    return toTargetView(pickRoundTarget(settings.targetId, usedTargetIds))
  }, [
    activeMatch?.targetId,
    activeMatch?.targetName,
    activeMatch?.targetView,
    settings.targetId,
    settings.targetName,
    settings.targetView,
    usedTargetIds,
  ])

  const hasSubmitted = isPartyMatch
    ? Boolean(
        activeMatch?.submissions.some((submission) => submission.userId === user?.id),
      )
    : submitted

  useEffect(() => {
    try {
      const savedValue = window.sessionStorage.getItem(chatPreferenceKey)
      setChatHidden(savedValue === 'true')
    } catch {
      setChatHidden(false)
    }
  }, [chatPreferenceKey])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(chatPreferenceKey, String(chatHidden))
    } catch {}
  }, [chatHidden, chatPreferenceKey])

  useEffect(() => {
    setGuess(null)
    setSubmitted(false)
  }, [currentRound])

  useEffect(() => {
    if (activeMatch) {
      const tick = () => {
        const startedAt = new Date(activeMatch.roundStartedAt).getTime()
        const durationMs = Number(activeMatch.roundTime) * 1000
        const elapsedMs = Date.now() - startedAt
        const nextValue = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000))
        setTimeLeft(nextValue)
      }

      tick()
      const interval = window.setInterval(tick, 250)
      return () => window.clearInterval(interval)
    }

    if (timeLeft <= 0) {
      return
    }

    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer)
          return 0
        }

        return current - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [activeMatch, timeLeft])

  useEffect(() => {
    if (!partyCode || !party || !activeMatch || !user) {
      return
    }

    if (activeMatch.status === 'reveal') {
      navigate('/result', {
        state: {
          guess: activeMatch.submissions.find((entry) => entry.userId === user.id)?.guess ?? null,
          roundTime: activeMatch.roundTime,
          roundCount: activeMatch.roundCount,
          mode: activeMatch.mode,
          currentRound: activeMatch.currentRound,
          targetId: activeMatch.targetId,
          targetName: activeMatch.targetName,
          targetView: activeMatch.targetView,
          runningTotalScore: activeMatch.totalScores[user.id] ?? 0,
          usedTargetIds: activeMatch.usedTargetIds,
          roundResults,
          timedOut: false,
          partyCode,
          partyMembers: party.members,
          matchType: activeMatch.matchType,
        },
      })
    }
  }, [activeMatch, navigate, party, partyCode, roundResults, user])

  async function submitRound(submittedGuess: GuessCoords, timedOut: boolean) {
    if (isPartyMatch && partyCode && user) {
      await submitPartyGuess(partyCode, user.id, submittedGuess, timedOut)
      setSubmitted(true)
      return
    }

    if (submitted) {
      return
    }

    setSubmitted(true)

    navigate('/result', {
      state: {
        guess: submittedGuess,
        matchType: settings.matchType,
        roundTime: settings.roundTime,
        roundCount: settings.roundCount,
        mode: settings.mode,
        currentRound,
        targetId: target.id,
        targetName: target.name,
        targetView: {
          lat: target.lat,
          lng: target.lng,
          heading: target.heading,
          pitch: target.pitch,
          panoId: target.panoId ?? null,
        },
        runningTotalScore,
        usedTargetIds,
        roundResults,
        timedOut,
      },
    })
  }

  useEffect(() => {
    if (timeLeft !== 0 || !partyCode || !user) {
      return
    }

    const currentPartyCode = partyCode
    const currentUserId = user.id

    if (activeMatch?.status === 'playing') {
      async function revealCurrentRound() {
        if (!hasSubmitted) {
          await submitPartyGuess(currentPartyCode, currentUserId, null, true)
        }

        await revealPartyRound(currentPartyCode)
      }

      void revealCurrentRound()
    }
  }, [activeMatch?.status, hasSubmitted, partyCode, timeLeft, user])

  useEffect(() => {
    if (!isPartyMatch && timeLeft === 0 && !submitted) {
      void submitRound(guess, true)
    }
  }, [guess, isPartyMatch, submitted, timeLeft])

  function handleLockGuess() {
    if (!guess || hasSubmitted || timeLeft === 0) {
      return
    }

    void submitRound(guess, false)
  }

  async function handleLeaveLobby() {
    if (partyCode && user) {
      await leaveParty(partyCode, user.id)
    }

    navigate('/play')
  }

  async function handleSendChatMessage() {
    if (!partyCode || !user) {
      return
    }

    try {
      const nextMessages = await sendPartyChatMessage({
        code: partyCode,
        userId: user.id,
        displayName: user.displayName,
        body: chatInput,
      })

      setChatMessages(nextMessages)
      setChatInput('')
    } catch {}
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const targetElement = event.target as HTMLElement | null
      const tagName = targetElement?.tagName
      const isTypingField =
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        targetElement?.isContentEditable

      if (event.code === 'Escape') {
        event.preventDefault()
        setSettingsOpen((open) => !open)
        return
      }

      if (event.code !== 'Space') {
        return
      }

      if (isTypingField || !guess || hasSubmitted || timeLeft === 0) {
        return
      }

      event.preventDefault()
      void submitRound(guess, false)
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [guess, hasSubmitted, timeLeft])

  return (
    <main className="game-screen">
      <section className="world-view">
        <StreetViewPanel mode={mode} view={target} />

        <div className="game-brand">Mueyyensayt</div>

        <section className="game-stats-banner" aria-label="Round stats">
          <div className="game-stats-row">
            <article className="game-stats-cell">
              <span>Time</span>
              <strong>{formatTimeLeft(timeLeft)}</strong>
            </article>
            <article className="game-stats-cell">
              <span>Round</span>
              <strong>
                {currentRound}/{totalRounds}
              </strong>
            </article>
            <article className="game-stats-cell">
              <span>{matchType === 'team-duel' ? 'Team' : 'Score'}</span>
              <strong>
                {matchType === 'team-duel' && currentMember
                  ? `${formatTeamName(currentMember.team)}`
                  : runningTotalScore}
              </strong>
            </article>
          </div>
          {matchType === 'team-duel' && teamPoints ? (
            <div className="game-team-points-row">
              <span>Red {teamPoints.red}</span>
              <span>Black {teamPoints.black}</span>
            </div>
          ) : null}
          <button
            type="button"
            className="game-stats-settings"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            Settings
          </button>
        </section>

        {settingsOpen ? (
          <div className="game-settings-overlay">
            <section className="game-settings-modal">
              <div className="game-settings-header">
                <strong>Lobby Settings</strong>
                <span>{partyCode ? `Party ${partyCode}` : 'Solo match'}</span>
              </div>

              <div className="game-settings-body">
                <div className="game-settings-players">
                  {partyMembers.length > 0 ? (
                    partyMembers.map((member) => (
                      <div key={member.userId} className="game-settings-player">
                        <strong>
                          {member.displayName}
                          {member.userId === user?.id ? ' (You)' : ''}
                        </strong>
                        <small>
                          {member.isGuest ? 'Guest' : 'Player'}
                          {matchType === 'team-duel' ? ` | ${formatTeamName(member.team)} Team` : ''}
                        </small>
                      </div>
                    ))
                  ) : (
                    <div className="game-settings-player">
                      <strong>{user?.displayName ?? 'You'}</strong>
                      <small>Solo player</small>
                    </div>
                  )}
                </div>

                <div className="game-settings-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setSettingsOpen(false)}
                  >
                    Back to game
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setChatHidden((hidden) => !hidden)}
                  >
                    {chatHidden ? 'Show chat' : 'Hide chat'}
                  </button>
                  <button type="button" className="danger-button" onClick={handleLeaveLobby}>
                    Exit lobby
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {!chatHidden ? (
          <section className={chatCollapsed ? 'game-chat collapsed' : 'game-chat'}>
            <div className="game-chat-header">
              <div>
                <strong>{partyCode ? 'Party chat' : 'Notes'}</strong>
                <small>{chatMessages.length} messages</small>
              </div>
              <button
                type="button"
                className="chat-collapse-button"
                onClick={() => setChatCollapsed((collapsed) => !collapsed)}
              >
                {chatCollapsed ? 'Open' : 'Hide'}
              </button>
            </div>

            {!chatCollapsed ? (
              <>
                <div className="game-chat-messages">
                  {chatMessages.length > 0 ? (
                    chatMessages.map((message) => (
                      <article key={message.id} className="game-chat-message">
                        <strong>{message.displayName}</strong>
                        <p>{message.body}</p>
                      </article>
                    ))
                  ) : (
                    <p className="game-chat-empty">No messages yet.</p>
                  )}
                </div>

                {partyCode && user ? (
                  <div className="game-chat-compose">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          handleSendChatMessage()
                        }
                      }}
                      placeholder="Say something to the party"
                    />
                    <button type="button" onClick={handleSendChatMessage}>
                      Send
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}

        <div className="guess-ui">
          <div className="mini-map-card">
            <GuessMiniMap onGuessChange={setGuess} locked={hasSubmitted || timeLeft === 0} />
          </div>

          <button
            type="button"
            className="lock-button"
            disabled={!guess || hasSubmitted || timeLeft === 0}
            onClick={handleLockGuess}
          >
            {hasSubmitted
              ? 'Locked'
              : timeLeft === 0
                ? 'Round ended'
                : guess
                  ? 'Lock guess'
                  : 'Place your pin on the map'}
          </button>
        </div>
      </section>
    </main>
  )
}
