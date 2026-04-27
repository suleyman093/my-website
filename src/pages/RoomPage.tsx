import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { loadCurrentAppState } from '../lib/auth'
import {
  buildFinalMatchStateFromParty,
  buildGameRouteStateFromParty,
  buildResultRouteStateFromParty,
} from '../lib/matchResume'
import {
  assignPartyTeam,
  changePartyTeam,
  formatTeamName,
  getParty,
  joinParty,
  kickPartyMember,
  leaveParty,
  startPartyMatch,
  subscribeToParty,
  updatePartySettings,
} from '../lib/party'
import type { Party, TeamId } from '../lib/party'

type RoomLocationState = {
  partyCode?: string
}

function formatRoundTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes === 0) {
    return `${remainingSeconds} SEC`
  }

  if (remainingSeconds === 0) {
    return `${minutes} MIN`
  }

  return `${minutes} MIN, ${remainingSeconds} SEC`
}

function formatRoundCount(rounds: number) {
  return rounds === 1 ? '1 ROUND' : `${rounds} ROUNDS`
}

function formatDamageIncrement(value: number) {
  return `${value.toFixed(1)}x`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeIncrement(value: number) {
  return clamp(Math.round(value * 2) / 2, 0, 10)
}

export function RoomPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const roomState = (location.state as RoomLocationState | null) ?? {}
  const [party, setParty] = useState<Party | null>(null)
  const [partyError, setPartyError] = useState<string | null>(null)

  const partyCode = roomState.partyCode?.toUpperCase() ?? ''
  const isLeader = Boolean(user && party && user.id === party.leaderId)

  const [roundTimeInput, setRoundTimeInput] = useState('60')
  const [roundCountInput, setRoundCountInput] = useState('5')
  const [initialPointsInput, setInitialPointsInput] = useState('6000')
  const [damageStartRoundInput, setDamageStartRoundInput] = useState('4')

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    const currentUser = user

    if (!partyCode) {
      let cancelled = false

      async function resumeWithoutCode() {
        try {
          const appState = await loadCurrentAppState()
          if (cancelled || !appState.party || !appState.route) {
            navigate('/play')
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
            return
          }

          navigate('/play')
        } catch {
          navigate('/play')
        }
      }

      void resumeWithoutCode()

      return () => {
        cancelled = true
      }

      return
    }

    let cancelled = false

    async function connectParty() {
      try {
        const nextParty = await joinParty(partyCode, currentUser)
        if (!cancelled) {
          setParty(nextParty)
          setPartyError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setPartyError(error instanceof Error ? error.message : 'Party could not be loaded.')
        }
      }
    }

    void connectParty()

    return () => {
      cancelled = true
    }
  }, [navigate, partyCode, user])

  useEffect(() => {
    if (!partyCode) {
      return
    }

    let cancelled = false

    async function refreshParty() {
      const nextParty = await getParty(partyCode)

      if (cancelled) {
        return
      }

      if (!nextParty) {
        setParty(null)
        setPartyError('This party no longer exists.')
        return
      }

      setParty(nextParty)
      setPartyError(null)
    }

    void refreshParty()
    const unsubscribe = subscribeToParty(partyCode, {
      onParty(nextParty, deleted) {
        if (cancelled) {
          return
        }

        if (!nextParty || deleted) {
          setParty(null)
          setPartyError('This party no longer exists.')
          return
        }

        setParty(nextParty)
        setPartyError(null)
      },
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [partyCode])

  useEffect(() => {
    if (!party?.activeMatch) {
      return
    }

    if (party.activeMatch.status === 'playing') {
      navigate('/game', {
        state: {
          matchType: party.activeMatch.matchType,
          mode: party.activeMatch.mode,
          roundTime: party.activeMatch.roundTime,
          roundCount: party.activeMatch.roundCount,
          currentRound: party.activeMatch.currentRound,
          targetId: party.activeMatch.targetId,
          targetName: party.activeMatch.targetName,
          targetView: party.activeMatch.targetView,
          runningTotalScore: party.activeMatch.totalScores[user?.id ?? ''] ?? 0,
          usedTargetIds: party.activeMatch.usedTargetIds,
          roundResults: party.activeMatch.roundResults.map((round) => {
            const currentStanding =
              round.standings.find((standing) => standing.userId === user?.id) ?? null

            return {
              roundNumber: round.roundNumber,
              targetName: round.targetName,
              distanceKm: currentStanding?.distanceKm ?? 0,
              score: currentStanding?.score ?? 0,
              guessed: currentStanding?.guessed ?? false,
            }
          }),
          partyCode: party.code,
          partyMembers: party.members,
        },
      })
    }
  }, [navigate, party, user?.id])

  useEffect(() => {
    if (!party) {
      return
    }

    setRoundTimeInput(party.settings.roundTime)
    setRoundCountInput(party.settings.roundCount)
    setInitialPointsInput(party.settings.initialPoints)
    setDamageStartRoundInput(party.settings.damageStartRound)
  }, [party])

  const modeLabel = useMemo(
    () => (party?.settings.mode === 'non-moving' ? 'Non-moving' : 'Moving'),
    [party],
  )

  const matchTypeLabel = useMemo(
    () => (party?.settings.matchType === 'team-duel' ? 'Team Duel' : 'Regular'),
    [party],
  )

  const redMembers = party?.members.filter((member) => member.team === 'red') ?? []
  const blackMembers = party?.members.filter((member) => member.team === 'black') ?? []
  const currentUserTeam = party?.members.find((member) => member.userId === user?.id)?.team ?? null

  async function updateSettings(nextSettings: Party['settings']) {
    if (!party || !user || !isLeader) {
      return
    }

    try {
      const nextParty = await updatePartySettings(party.code, user.id, nextSettings)
      setParty(nextParty)
      setPartyError(null)
    } catch (error) {
      setPartyError(error instanceof Error ? error.message : 'Could not update party settings.')
    }
  }

  function commitRoundTime() {
    if (!party) return
    const parsed = Number(roundTimeInput)
    if (Number.isNaN(parsed)) {
      setRoundTimeInput(party.settings.roundTime)
      return
    }
    updateSettings({ ...party.settings, roundTime: String(clamp(Math.round(parsed), 1, 600)) })
  }

  function commitRoundCount() {
    if (!party) return
    const parsed = Number(roundCountInput)
    if (Number.isNaN(parsed)) {
      setRoundCountInput(party.settings.roundCount)
      return
    }
    updateSettings({ ...party.settings, roundCount: String(clamp(Math.round(parsed), 1, 50)) })
  }

  function commitInitialPoints() {
    if (!party) return
    const parsed = Number(initialPointsInput)
    if (Number.isNaN(parsed)) {
      setInitialPointsInput(party.settings.initialPoints)
      return
    }
    updateSettings({
      ...party.settings,
      initialPoints: String(clamp(Math.round(parsed), 1000, 20000)),
    })
  }

  function commitDamageStartRound() {
    if (!party) return
    const parsed = Number(damageStartRoundInput)
    if (Number.isNaN(parsed)) {
      setDamageStartRoundInput(party.settings.damageStartRound)
      return
    }
    updateSettings({
      ...party.settings,
      damageStartRound: String(clamp(Math.round(parsed), 1, 50)),
    })
  }

  function stepDamageIncrement(direction: -1 | 1) {
    if (!party || !isLeader) return
    updateSettings({
      ...party.settings,
      damageIncrement: String(
        normalizeIncrement(Number(party.settings.damageIncrement) + direction * 0.5),
      ),
    })
  }

  async function handleStartMatch() {
    if (!party || !isLeader) return
    try {
      const nextParty = await startPartyMatch(party.code, user!.id)
      setParty(nextParty)
      setPartyError(null)
    } catch (error) {
      setPartyError(error instanceof Error ? error.message : 'Could not start match.')
    }
  }

  async function handleLeaveParty() {
    if (!user || !party) {
      navigate('/play')
      return
    }
    await leaveParty(party.code, user.id)
    navigate('/play')
  }

  async function handleKickMember(memberId: string) {
    if (!party || !user || !isLeader) return
    try {
      const nextParty = await kickPartyMember(party.code, user.id, memberId)
      setParty(nextParty)
      setPartyError(null)
    } catch (error) {
      setPartyError(error instanceof Error ? error.message : 'Could not kick player.')
    }
  }

  async function handleTeamChange(team: TeamId) {
    if (!party || !user) return
    try {
      const nextParty = await changePartyTeam(party.code, user.id, team)
      setParty(nextParty)
      setPartyError(null)
    } catch (error) {
      setPartyError(error instanceof Error ? error.message : 'Could not switch teams.')
    }
  }

  async function handleAssignTeam(memberId: string, team: TeamId) {
    if (!party || !user || !isLeader) return
    try {
      const nextParty = await assignPartyTeam(party.code, user.id, memberId, team)
      setParty(nextParty)
      setPartyError(null)
    } catch (error) {
      setPartyError(error instanceof Error ? error.message : 'Could not reassign player.')
    }
  }

  if (partyError && !party) {
    return (
      <main className="app-shell">
        <section className="hero">
          <p className="eyebrow">Party</p>
          <h1>Party unavailable</h1>
          <p className="hero-copy">{partyError}</p>
          <div className="hero-actions">
            <Link to="/play" className="button-link">
              Back to play
            </Link>
          </div>
        </section>
      </main>
    )
  }

  if (!party) {
    return (
      <main className="app-shell">
        <section className="hero">
          <p className="eyebrow">Party</p>
          <h1>Loading party</h1>
          <p className="hero-copy">Syncing the lobby and pulling in the latest settings.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="hero room-hero">
        <p className="eyebrow">Party Lobby</p>
        <h1>{isLeader ? 'You are the party leader' : 'Waiting for the leader'}</h1>
        <p className="hero-copy">
          Party code <strong>{party.code}</strong>. The leader controls the settings and can remove
          players from the lobby.
        </p>

        <div className="room-code-banner">
          <span>Party code</span>
          <strong>{party.code}</strong>
          <small>{party.members.length} players connected</small>
        </div>

        <div className="setup-panel-grid room-settings-grid">
          <section className="setup-panel">
            <div className="setup-panel-header">
              <h2>Match Type</h2>
              <span className="room-role-badge">{isLeader ? 'Leader controls' : 'Read only'}</span>
            </div>

            <div className="mode-toggle" role="tablist" aria-label="Party match type">
              <button
                type="button"
                className={party.settings.matchType === 'regular' ? 'mode-option active' : 'mode-option'}
                onClick={() => updateSettings({ ...party.settings, matchType: 'regular' })}
                disabled={!isLeader}
              >
                Regular
              </button>
              <button
                type="button"
                className={party.settings.matchType === 'team-duel' ? 'mode-option active' : 'mode-option'}
                onClick={() => updateSettings({ ...party.settings, matchType: 'team-duel' })}
                disabled={!isLeader}
              >
                Team Duel
              </button>
            </div>
          </section>

          <section className="setup-panel">
            <div className="setup-panel-header">
              <h2>Camera Mode</h2>
            </div>

            <div className="mode-toggle" role="tablist" aria-label="Party camera mode">
              <button
                type="button"
                className={party.settings.mode === 'moving' ? 'mode-option active' : 'mode-option'}
                onClick={() => updateSettings({ ...party.settings, mode: 'moving' })}
                disabled={!isLeader}
              >
                Moving
              </button>
              <button
                type="button"
                className={party.settings.mode === 'non-moving' ? 'mode-option active' : 'mode-option'}
                onClick={() => updateSettings({ ...party.settings, mode: 'non-moving' })}
                disabled={!isLeader}
              >
                No Move
              </button>
            </div>
          </section>

          <section className="setup-panel">
            <div className="setup-panel-header">
              <h2>Round Time</h2>
              <div className="setup-value-editor">
                <input
                  type="number"
                  min="1"
                  max="600"
                  value={roundTimeInput}
                  onChange={(event) => setRoundTimeInput(event.target.value)}
                  onBlur={commitRoundTime}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitRoundTime()
                  }}
                  disabled={!isLeader}
                />
              </div>
            </div>

            <input
              className="setup-slider"
              type="range"
              min="1"
              max="600"
              step="1"
              value={Number(party.settings.roundTime)}
              onChange={(event) => updateSettings({ ...party.settings, roundTime: event.target.value })}
              disabled={!isLeader}
            />

            <p className="setup-slider-value">{formatRoundTime(Number(party.settings.roundTime))}</p>
          </section>

          <section className="setup-panel">
            <div className="setup-panel-header">
              <h2>Number Of Rounds</h2>
              <div className="setup-value-editor">
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={roundCountInput}
                  onChange={(event) => setRoundCountInput(event.target.value)}
                  onBlur={commitRoundCount}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitRoundCount()
                  }}
                  disabled={!isLeader}
                />
              </div>
            </div>

            <input
              className="setup-slider"
              type="range"
              min="1"
              max="50"
              step="1"
              value={Number(party.settings.roundCount)}
              onChange={(event) => updateSettings({ ...party.settings, roundCount: event.target.value })}
              disabled={!isLeader}
            />

            <p className="setup-slider-value">{formatRoundCount(Number(party.settings.roundCount))}</p>
          </section>

          {party.settings.matchType === 'team-duel' ? (
            <>
              <section className="setup-panel">
                <div className="setup-panel-header">
                  <h2>Initial Points</h2>
                  <div className="setup-value-editor">
                    <input
                      type="number"
                      min="1000"
                      max="20000"
                      value={initialPointsInput}
                      onChange={(event) => setInitialPointsInput(event.target.value)}
                      onBlur={commitInitialPoints}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitInitialPoints()
                      }}
                      disabled={!isLeader}
                    />
                  </div>
                </div>

                <input
                  className="setup-slider"
                  type="range"
                  min="1000"
                  max="20000"
                  step="100"
                  value={Number(party.settings.initialPoints)}
                  onChange={(event) =>
                    updateSettings({ ...party.settings, initialPoints: event.target.value })
                  }
                  disabled={!isLeader}
                />

                <p className="setup-slider-value">{party.settings.initialPoints} HP per team</p>
              </section>

              <section className="setup-panel">
                <div className="setup-panel-header">
                  <h2>Damage Starts</h2>
                  <div className="setup-value-editor">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={damageStartRoundInput}
                      onChange={(event) => setDamageStartRoundInput(event.target.value)}
                      onBlur={commitDamageStartRound}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitDamageStartRound()
                      }}
                      disabled={!isLeader}
                    />
                  </div>
                </div>

                <input
                  className="setup-slider"
                  type="range"
                  min="1"
                  max="50"
                  step="1"
                  value={Number(party.settings.damageStartRound)}
                  onChange={(event) =>
                    updateSettings({ ...party.settings, damageStartRound: event.target.value })
                  }
                  disabled={!isLeader}
                />

                <p className="setup-slider-value">Round {party.settings.damageStartRound}</p>
              </section>

              <section className="setup-panel">
                <div className="setup-panel-header">
                  <h2>Damage Increment</h2>
                </div>

                <div className="increment-stepper">
                  <button
                    type="button"
                    className="increment-stepper-button"
                    onClick={() => stepDamageIncrement(-1)}
                    disabled={!isLeader || Number(party.settings.damageIncrement) <= 0}
                  >
                    -
                  </button>
                  <div className="increment-stepper-value">
                    {formatDamageIncrement(Number(party.settings.damageIncrement))}
                  </div>
                  <button
                    type="button"
                    className="increment-stepper-button"
                    onClick={() => stepDamageIncrement(1)}
                    disabled={!isLeader || Number(party.settings.damageIncrement) >= 10}
                  >
                    +
                  </button>
                </div>

                <p className="setup-slider-value">
                  {Number(party.settings.damageIncrement) === 0
                    ? 'Stays at 1.0x all match'
                    : `Round ${party.settings.damageStartRound} stays 1.0x, then increases by ${Number(party.settings.damageIncrement).toFixed(1)}x each round`}
                </p>
              </section>
            </>
          ) : null}
        </div>

        <div className="setup-summary modern-setup-summary">
          <p>
            <strong>Match type:</strong> {matchTypeLabel}
          </p>
          <p>
            <strong>Camera mode:</strong> {modeLabel}
          </p>
          <p>
            <strong>Round time:</strong> {formatRoundTime(Number(party.settings.roundTime))}
          </p>
          <p>
            <strong>Total rounds:</strong> {formatRoundCount(Number(party.settings.roundCount))}
          </p>
          {party.settings.matchType === 'team-duel' ? (
            <>
              <p>
                <strong>Initial points:</strong> {party.settings.initialPoints}
              </p>
              <p>
                <strong>Damage starts:</strong> Round {party.settings.damageStartRound}
              </p>
              <p>
                <strong>Damage increment:</strong> {formatDamageIncrement(Number(party.settings.damageIncrement))}
              </p>
            </>
          ) : null}
        </div>

        {party.settings.matchType === 'team-duel' ? (
          <section className="players-panel duel-lobby-panel">
            <div className="players-header">
              <h2>Teams</h2>
              <span>
                {party.settings.teamChoiceLocked
                  ? 'Leader assigns teams'
                  : 'Players can choose freely'}
              </span>
            </div>

            <div className="duel-lock-row">
              <button
                type="button"
                className={party.settings.teamChoiceLocked ? 'ghost-button active-control' : 'ghost-button'}
                onClick={() =>
                  updateSettings({
                    ...party.settings,
                    teamChoiceLocked: !party.settings.teamChoiceLocked,
                  })
                }
                disabled={!isLeader}
              >
                {party.settings.teamChoiceLocked ? 'Unlock team choice' : 'Lock team choice'}
              </button>
            </div>

            <div className="team-lobby-grid">
              <section className="team-lobby-card red-team-card">
                <div className="team-lobby-header">
                  <strong>{formatTeamName('red')} Team</strong>
                  <span>{redMembers.length} players</span>
                </div>

                <div className="team-lobby-members">
                  {redMembers.map((member) => (
                    <div key={member.userId} className="team-lobby-member">
                      <div>
                        <p className="player-name">
                          {member.displayName}
                          {member.userId === user?.id ? ' (You)' : ''}
                        </p>
                        <p className="player-status">
                          {member.userId === party.leaderId ? 'Leader' : member.isGuest ? 'Guest' : 'Player'}
                        </p>
                      </div>

                      {isLeader && member.team !== 'black' ? null : null}
                    </div>
                  ))}
                </div>
              </section>

              <section className="team-lobby-card black-team-card">
                <div className="team-lobby-header">
                  <strong>{formatTeamName('black')} Team</strong>
                  <span>{blackMembers.length} players</span>
                </div>

                <div className="team-lobby-members">
                  {blackMembers.map((member) => (
                    <div key={member.userId} className="team-lobby-member">
                      <div>
                        <p className="player-name">
                          {member.displayName}
                          {member.userId === user?.id ? ' (You)' : ''}
                        </p>
                        <p className="player-status">
                          {member.userId === party.leaderId ? 'Leader' : member.isGuest ? 'Guest' : 'Player'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="team-lobby-controls">
              {!party.settings.teamChoiceLocked ? (
                <div className="team-switcher">
                  <button
                    type="button"
                    className={`team-button red ${currentUserTeam === 'red' ? 'active-team-button' : ''}`}
                    onClick={() => handleTeamChange('red')}
                  >
                    Join {formatTeamName('red')}
                  </button>
                  <button
                    type="button"
                    className={`team-button black ${currentUserTeam === 'black' ? 'active-team-button' : ''}`}
                    onClick={() => handleTeamChange('black')}
                  >
                    Join {formatTeamName('black')}
                  </button>
                </div>
              ) : null}

              {party.settings.teamChoiceLocked && isLeader ? (
                <div className="leader-team-assignment">
                  {party.members.map((member) => (
                    <div key={member.userId} className="leader-team-row">
                      <span>
                        {member.displayName}
                        {member.userId === user?.id ? ' (You)' : ''}
                      </span>
                      <div className="leader-team-buttons">
                        <button
                          type="button"
                          className={member.team === 'red' ? 'team-assign-button active red' : 'team-assign-button red'}
                          onClick={() => handleAssignTeam(member.userId, 'red')}
                        >
                          Red
                        </button>
                        <button
                          type="button"
                          className={member.team === 'black' ? 'team-assign-button active black' : 'team-assign-button black'}
                          onClick={() => handleAssignTeam(member.userId, 'black')}
                        >
                          Black
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="players-panel">
            <div className="players-header">
              <h2>Players</h2>
              <span>{party.members.length} in party</span>
            </div>

            <div className="player-list">
              {party.members.map((member) => {
                const isMemberLeader = member.userId === party.leaderId
                const isCurrentUser = member.userId === user?.id

                return (
                  <div key={member.userId} className="player-card room-player-card">
                    <div>
                      <p className="player-name">
                        {member.displayName}
                        {isCurrentUser ? ' (You)' : ''}
                      </p>
                      <p className="player-status">
                        {isMemberLeader ? 'Leader' : member.isGuest ? 'Guest player' : 'Player'}
                      </p>
                    </div>

                    {isLeader && !isMemberLeader ? (
                      <button
                        type="button"
                        className="kick-button"
                        onClick={() => handleKickMember(member.userId)}
                      >
                        Kick
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {partyError ? <p className="auth-error party-error">{partyError}</p> : null}

        <div className="hero-actions">
          {isLeader ? (
            <button type="button" onClick={handleStartMatch}>
              Start match
            </button>
          ) : (
            <button type="button" className="ghost-button" disabled>
              Waiting for leader
            </button>
          )}

          <button type="button" className="ghost-button" onClick={handleLeaveParty}>
            Leave party
          </button>
          <Link to="/" className="button-link secondary">
            Home
          </Link>
        </div>
      </section>
    </main>
  )
}
