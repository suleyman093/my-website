import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useAuth } from '../lib/AuthContext'
import { loadCurrentAppState } from '../lib/auth'
import {
  buildFinalMatchStateFromParty,
  buildGameRouteStateFromParty,
  buildResultRouteStateFromParty,
} from '../lib/matchResume'
import { createParty, joinParty } from '../lib/party'
import type { MatchType } from '../lib/party'

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

function formatInitialPoints(points: number) {
  return `${points} HP`
}

function formatDamageStartRound(round: number) {
  return round === 1 ? 'STARTS ROUND 1' : `STARTS ROUND ${round}`
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

export function PlayPage() {
  const { user } = useAuth()
  const [matchType, setMatchType] = useState<MatchType>('regular')
  const [mode, setMode] = useState<'moving' | 'non-moving'>('moving')
  const [roundTime, setRoundTime] = useState(90)
  const [roundCount, setRoundCount] = useState(5)
  const [initialPoints, setInitialPoints] = useState(6000)
  const [damageStartRound, setDamageStartRound] = useState(4)
  const [damageIncrement, setDamageIncrement] = useState(1)
  const [roundTimeInput, setRoundTimeInput] = useState('90')
  const [roundCountInput, setRoundCountInput] = useState('5')
  const [initialPointsInput, setInitialPointsInput] = useState('6000')
  const [damageStartRoundInput, setDamageStartRoundInput] = useState('4')
  const [partyCodeInput, setPartyCodeInput] = useState('')
  const [partyError, setPartyError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) {
      return
    }

    const currentUser = user
    let cancelled = false

    async function resume() {
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

    void resume()

    return () => {
      cancelled = true
    }
  }, [navigate, user])

  useEffect(() => {
    setRoundTimeInput(String(roundTime))
  }, [roundTime])

  useEffect(() => {
    setRoundCountInput(String(roundCount))
  }, [roundCount])

  useEffect(() => {
    setInitialPointsInput(String(initialPoints))
  }, [initialPoints])

  useEffect(() => {
    setDamageStartRoundInput(String(damageStartRound))
  }, [damageStartRound])

  async function handleStartMatch() {
    if (!user) {
      navigate('/login')
      return
    }

    setPartyError(null)

    try {
      const party = await createParty(user, {
        matchType,
        mode,
        roundTime: String(roundTime),
        roundCount: String(roundCount),
        initialPoints: String(initialPoints),
        damageStartRound: String(damageStartRound),
        damageIncrement: String(damageIncrement),
        teamChoiceLocked: false,
      })

      navigate('/room', {
        state: {
          partyCode: party.code,
        },
      })
    } catch (error) {
      setPartyError(error instanceof Error ? error.message : 'Could not create party.')
    }
  }

  async function handleJoinParty() {
    if (!user) {
      navigate('/login')
      return
    }

    if (!partyCodeInput.trim()) {
      setPartyError('Enter a 6-character party code first.')
      return
    }

    try {
      const party = await joinParty(partyCodeInput, user)
      setPartyError(null)
      navigate('/room', {
        state: {
          partyCode: party.code,
        },
      })
    } catch (error) {
      setPartyError(error instanceof Error ? error.message : 'Could not join party.')
    }
  }

  function commitRoundTime() {
    const parsed = Number(roundTimeInput)
    if (Number.isNaN(parsed)) {
      setRoundTimeInput(String(roundTime))
      return
    }
    setRoundTime(clamp(Math.round(parsed), 1, 600))
  }

  function commitRoundCount() {
    const parsed = Number(roundCountInput)
    if (Number.isNaN(parsed)) {
      setRoundCountInput(String(roundCount))
      return
    }
    setRoundCount(clamp(Math.round(parsed), 1, 50))
  }

  function commitInitialPoints() {
    const parsed = Number(initialPointsInput)
    if (Number.isNaN(parsed)) {
      setInitialPointsInput(String(initialPoints))
      return
    }
    setInitialPoints(clamp(Math.round(parsed), 1000, 20000))
  }

  function commitDamageStartRound() {
    const parsed = Number(damageStartRoundInput)
    if (Number.isNaN(parsed)) {
      setDamageStartRoundInput(String(damageStartRound))
      return
    }
    setDamageStartRound(clamp(Math.round(parsed), 1, 50))
  }

  function stepDamageIncrement(direction: -1 | 1) {
    setDamageIncrement((current) => normalizeIncrement(current + 0.5 * direction))
  }

  function handleEnter(event: KeyboardEvent<HTMLInputElement>, commit: () => void) {
    if (event.key === 'Enter') {
      commit()
    }
  }

  return (
    <main className="app-shell home-screen result-screen">
      <div className="home-stars" aria-hidden="true" />
      <div className="home-stars home-stars-secondary" aria-hidden="true" />
      <div className="space-planets" aria-hidden="true">
        <div className="space-planet planet-one" />
        <div className="space-planet planet-two" />
        <div className="space-planet planet-three" />
        <div className="space-planet planet-four" />
      </div>
      <div className="home-earth-wrap result-earth-wrap" aria-hidden="true">
        <div className="home-earth-glow" />
        <div className="home-earth" />
      </div>

      
      <section className="hero setup-hero">
        <p className="eyebrow">Game Setup</p>
        <h1>Create a match</h1>
        <p className="hero-copy">
          Tune the match rules before your party jumps into the world.
        </p>

        <div className="setup-panel-grid">
          <section className="setup-panel">
            <div className="setup-panel-header">
              <h2>Match Type</h2>
            </div>

            <div className="mode-toggle" role="tablist" aria-label="Match type">
              <button
                type="button"
                className={matchType === 'regular' ? 'mode-option active' : 'mode-option'}
                onClick={() => setMatchType('regular')}
              >
                Regular
              </button>
              <button
                type="button"
                className={matchType === 'team-duel' ? 'mode-option active' : 'mode-option'}
                onClick={() => setMatchType('team-duel')}
              >
                Team Duel
              </button>
            </div>
          </section>

          <section className="setup-panel">
            <div className="setup-panel-header">
              <h2>Camera Mode</h2>
            </div>

            <div className="mode-toggle" role="tablist" aria-label="Camera mode">
              <button
                type="button"
                className={mode === 'moving' ? 'mode-option active' : 'mode-option'}
                onClick={() => setMode('moving')}
              >
                Moving
              </button>
              <button
                type="button"
                className={mode === 'non-moving' ? 'mode-option active' : 'mode-option'}
                onClick={() => setMode('non-moving')}
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
                  onKeyDown={(event) => handleEnter(event, commitRoundTime)}
                />
              </div>
            </div>

            <input
              className="setup-slider"
              type="range"
              min="1"
              max="600"
              step="1"
              value={roundTime}
              onChange={(event) => setRoundTime(Number(event.target.value))}
            />

            <p className="setup-slider-value">{formatRoundTime(roundTime)}</p>
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
                  onKeyDown={(event) => handleEnter(event, commitRoundCount)}
                />
              </div>
            </div>

            <input
              className="setup-slider"
              type="range"
              min="1"
              max="50"
              step="1"
              value={roundCount}
              onChange={(event) => setRoundCount(Number(event.target.value))}
            />

            <p className="setup-slider-value">{formatRoundCount(roundCount)}</p>
          </section>

          {matchType === 'team-duel' ? (
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
                      onKeyDown={(event) => handleEnter(event, commitInitialPoints)}
                    />
                  </div>
                </div>

                <input
                  className="setup-slider"
                  type="range"
                  min="1000"
                  max="20000"
                  step="100"
                  value={initialPoints}
                  onChange={(event) => setInitialPoints(Number(event.target.value))}
                />

                <p className="setup-slider-value">{formatInitialPoints(initialPoints)}</p>
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
                      onKeyDown={(event) => handleEnter(event, commitDamageStartRound)}
                    />
                  </div>
                </div>

                <input
                  className="setup-slider"
                  type="range"
                  min="1"
                  max="50"
                  step="1"
                  value={damageStartRound}
                  onChange={(event) => setDamageStartRound(Number(event.target.value))}
                />

                <p className="setup-slider-value">
                  {formatDamageStartRound(damageStartRound)}
                </p>
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
                    disabled={damageIncrement <= 0}
                  >
                    -
                  </button>
                  <div className="increment-stepper-value">{formatDamageIncrement(damageIncrement)}</div>
                  <button
                    type="button"
                    className="increment-stepper-button"
                    onClick={() => stepDamageIncrement(1)}
                    disabled={damageIncrement >= 10}
                  >
                    +
                  </button>
                </div>

                <p className="setup-slider-value">
                  {damageIncrement === 0
                    ? 'Stays at 1.0x all match'
                    : `Round ${damageStartRound} stays 1.0x, then increases by ${damageIncrement.toFixed(1)}x each round`}
                </p>
              </section>
            </>
          ) : null}
        </div>

        <div className="setup-summary modern-setup-summary">
          <p>
            <strong>Match type:</strong> {matchType === 'team-duel' ? 'Team Duel' : 'Regular'}
          </p>
          <p>
            <strong>Camera mode:</strong> {mode === 'non-moving' ? 'Non-moving' : 'Moving'}
          </p>
          <p>
            <strong>Round time:</strong> {formatRoundTime(roundTime)}
          </p>
          <p>
            <strong>Total rounds:</strong> {formatRoundCount(roundCount)}
          </p>
          {matchType === 'team-duel' ? (
            <>
              <p>
                <strong>Initial points:</strong> {initialPoints}
              </p>
              <p>
                <strong>Damage starts:</strong> Round {damageStartRound}
              </p>
              <p>
                <strong>Damage increment:</strong> {formatDamageIncrement(damageIncrement)}
              </p>
            </>
          ) : null}
        </div>

        <section className="party-entry-panel">
          <div className="party-entry-copy">
            <h2>Join a party</h2>
            <p>Enter a 6-character room code to join an existing party.</p>
          </div>

          <div className="party-entry-form">
            <input
              type="text"
              value={partyCodeInput}
              onChange={(event) =>
                setPartyCodeInput(
                  event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
                )
              }
              placeholder="ABC123"
              maxLength={6}
            />
            <button type="button" className="ghost-button" onClick={handleJoinParty}>
              Join party
            </button>
          </div>

          {partyError ? <p className="auth-error party-error">{partyError}</p> : null}
        </section>

        <div className="hero-actions">
          <button type="button" onClick={handleStartMatch}>
            Create party
          </button>
          <Link to="/" className="button-link secondary">
            Back
          </Link>
        </div>
      </section>
    </main>
  )
}
