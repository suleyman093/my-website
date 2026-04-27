/// <reference types="google.maps" />

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { generateMatchId, loadCurrentAppState } from '../lib/auth'
import {
  advancePartyMatch,
  formatTeamName,
  getParty,
  getPartyRevealSnapshot,
  subscribeToParty,
} from '../lib/party'
import type { Party, PartyMember, PartyTargetView } from '../lib/party'
import {
  buildFinalMatchStateFromParty,
  buildGameRouteStateFromParty,
  buildResultRouteStateFromParty,
} from '../lib/matchResume'

type ResultState = {
  guess: {
    lat: number
    lng: number
  } | null
  matchType?: 'regular' | 'team-duel'
  roundTime: string
  roundCount: string
  mode: string
  currentRound: number
  targetId: string
  targetView?: PartyTargetView
  targetName?: string
  runningTotalScore?: number
  usedTargetIds?: string[]
  roundResults?: {
    roundNumber: number
    targetName: string
    distanceKm: number
    score: number
    guessed: boolean
  }[]
  timedOut?: boolean
  partyCode?: string
  partyMembers?: PartyMember[]
}

export function ResultPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const state = location.state as ResultState | null
  const [party, setParty] = useState<Party | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [revealTarget, setRevealTarget] = useState<{
    id: string
    name: string
    lat: number
    lng: number
  } | null>(null)

  const partyCode = state?.partyCode
  const isPartyMatch = Boolean(partyCode && user)
  const matchType = party?.activeMatch?.matchType ?? state?.matchType ?? 'regular'

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

      if (cancelled) {
        return
      }

      setParty((currentParty) => {
        if (!nextParty) {
          return null
        }

        if (
          currentParty &&
          currentParty.updatedAt === nextParty.updatedAt &&
          currentParty.activeMatch?.updatedAt === nextParty.activeMatch?.updatedAt
        ) {
          return currentParty
        }

        return nextParty
      })
    }

    void refreshParty()
    const unsubscribe = subscribeToParty(currentPartyCode, {
      onParty(nextParty, deleted) {
        if (cancelled) {
          return
        }

        if (!nextParty || deleted) {
          setParty(null)
          return
        }

        setParty((currentParty) => {
          if (
            currentParty &&
            currentParty.updatedAt === nextParty.updatedAt &&
            currentParty.activeMatch?.updatedAt === nextParty.activeMatch?.updatedAt
          ) {
            return currentParty
          }

          return nextParty
        })
      },
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [partyCode])

  const roundTime = party?.activeMatch?.roundTime ?? state?.roundTime ?? '60'
  const roundCount = party?.activeMatch?.roundCount ?? state?.roundCount ?? '5'
  const mode = party?.activeMatch?.mode ?? state?.mode ?? 'moving'
  const currentRound =
    party?.activeMatch?.currentRound ?? state?.currentRound ?? 1
  const totalRounds = Number(roundCount)
  const timedOut = state?.timedOut ?? false
  const partyMembers = party?.members ?? state?.partyMembers ?? []

  const latestRoundResult = party?.activeMatch?.roundResults.at(-1) ?? null
  const target = revealTarget ?? {
    id: state?.targetId ?? 'reveal-fallback',
    name: state?.targetName ?? 'Reveal target',
    lat: state?.targetView?.lat ?? 0,
    lng: state?.targetView?.lng ?? 0,
  }

  const standings = latestRoundResult?.standings ?? []
  const partyTotals = party?.activeMatch?.totalScores ?? {}
  const teamSnapshot = latestRoundResult?.teamSnapshot ?? null
  const currentStanding =
    standings.find((standing) => standing.userId === user?.id) ?? null
  const roundedDistance = currentStanding?.distanceKm ?? 0
  const score = currentStanding?.score ?? 0
  const updatedTotalScore =
    party?.activeMatch?.totalScores[user?.id ?? ''] ?? state?.runningTotalScore ?? 0
  const hasGuess = currentStanding?.guessed ?? false
  const isLastRound = currentRound >= totalRounds
  const mapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!partyCode) {
      setRevealTarget((currentTarget) =>
        currentTarget ?? {
          id: state?.targetId ?? 'reveal-fallback',
          name: state?.targetName ?? 'Reveal target',
          lat: state?.targetView?.lat ?? 0,
          lng: state?.targetView?.lng ?? 0,
        },
      )
      return
    }

    const currentPartyCode = partyCode
    let cancelled = false

    async function loadRevealTarget() {
      try {
        const snapshot = await getPartyRevealSnapshot(currentPartyCode)
        if (!cancelled) {
          setRevealTarget(snapshot.target)
        }
      } catch {
        if (!cancelled) {
          setRevealTarget({
            id: state?.targetId ?? 'reveal-fallback',
            name: state?.targetName ?? 'Reveal target',
            lat: state?.targetView?.lat ?? 0,
            lng: state?.targetView?.lng ?? 0,
          })
        }
      }
    }

    void loadRevealTarget()

    return () => {
      cancelled = true
    }
  }, [partyCode, state?.targetId, state?.targetName, state?.targetView?.lat, state?.targetView?.lng])

  useEffect(() => {
    if (!party || !user) {
      return
    }

    if (party.activeMatch?.status === 'playing') {
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
          runningTotalScore: party.activeMatch.totalScores[user.id] ?? 0,
          usedTargetIds: party.activeMatch.usedTargetIds,
          roundResults: party.activeMatch.roundResults.map((round) => {
            const standing =
              round.standings.find((entry) => entry.userId === user.id) ?? null

            return {
              roundNumber: round.roundNumber,
              targetName: round.targetName,
              distanceKm: standing?.distanceKm ?? 0,
              score: standing?.score ?? 0,
              guessed: standing?.guessed ?? false,
            }
          }),
          partyCode: party.code,
          partyMembers: party.members,
        },
      })
    }

    if (party.activeMatch?.status === 'finished') {
      navigate('/final-result', {
        state: buildFinalMatchStateFromParty(party, user.id),
      })
    }
  }, [navigate, party, user])

  useEffect(() => {
    let cancelled = false

  async function loadRevealMap() {
      if (!mapRef.current) {
        return
      }

      try {
        const [{ loadGoogleMaps }] = await Promise.all([
          import('../lib/googleMapsLoader'),
        ])

        await loadGoogleMaps()

        if (cancelled || !mapRef.current) {
          return
        }

        const targetPosition = { lat: target.lat, lng: target.lng }
        const map = new google.maps.Map(mapRef.current, {
          center: targetPosition,
          zoom: 4,
          minZoom: 2,
          maxZoom: 20,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          rotateControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
          styles: [
            {
              featureType: 'poi',
              stylers: [{ visibility: 'off' }],
            },
            {
              featureType: 'transit',
              stylers: [{ visibility: 'off' }],
            },
          ],
        })

        new google.maps.Marker({
          position: targetPosition,
          map,
          title: 'Correct location',
          label: {
            text: 'Answer',
            color: '#ffffff',
            fontWeight: '700',
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#ef6a5b',
            fillOpacity: 1,
            strokeColor: '#0f1720',
            strokeWeight: 2,
          },
        })

        const bounds = new google.maps.LatLngBounds()
        bounds.extend(targetPosition)

        const revealStandings =
          matchType === 'team-duel' && teamSnapshot
            ? [
                teamSnapshot.redGuessPosition
                  ? {
                      userId: teamSnapshot.redChosenUserId ?? 'red-team',
                      displayName: teamSnapshot.redChosenDisplayName ?? 'Red Team',
                      guessPosition: teamSnapshot.redGuessPosition,
                    }
                  : null,
                teamSnapshot.blackGuessPosition
                  ? {
                      userId: teamSnapshot.blackChosenUserId ?? 'black-team',
                      displayName: teamSnapshot.blackChosenDisplayName ?? 'Black Team',
                      guessPosition: teamSnapshot.blackGuessPosition,
                    }
                  : null,
              ].filter(Boolean)
            : standings

        revealStandings.forEach((standing) => {
          if (!standing || !('guessPosition' in standing) || !standing.guessPosition) {
            return
          }

          new google.maps.Polyline({
            path: [standing.guessPosition, targetPosition],
            strokeColor:
              matchType === 'team-duel'
                ? standing.userId === teamSnapshot?.redChosenUserId
                  ? '#d23b54'
                  : '#8f7dff'
                : standing.userId === user?.id
                  ? '#f7e29a'
                  : '#8f7dff',
            strokeOpacity: 0.92,
            strokeWeight:
              matchType === 'team-duel'
                ? 4
                : standing.userId === user?.id
                  ? 5
                  : 3,
            map,
          })

          new google.maps.Marker({
            position: standing.guessPosition,
            map,
            title:
              matchType === 'team-duel'
                ? `${standing.displayName} anchor`
                : standing.userId === user?.id
                ? 'Your guess'
                : `${standing.displayName}'s guess`,
            label: {
              text:
                matchType === 'team-duel'
                  ? standing.userId === teamSnapshot?.redChosenUserId
                    ? 'R'
                    : 'B'
                  : standing.userId === user?.id
                    ? 'You'
                    : standing.displayName.slice(0, 1),
              color:
                matchType === 'team-duel'
                  ? '#ffffff'
                  : standing.userId === user?.id
                    ? '#0f1720'
                    : '#ffffff',
              fontWeight: '700',
            },
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale:
                matchType === 'team-duel'
                  ? 9
                  : standing.userId === user?.id
                    ? 10
                    : 8,
              fillColor:
                matchType === 'team-duel'
                  ? standing.userId === teamSnapshot?.redChosenUserId
                    ? '#d23b54'
                    : '#6d4ef3'
                  : standing.userId === user?.id
                    ? '#f7e29a'
                    : '#6d4ef3',
              fillOpacity: 1,
              strokeColor: '#0f1720',
              strokeWeight: 2,
            },
          })

          bounds.extend(standing.guessPosition)
        })

        map.fitBounds(bounds, 96)

        google.maps.event.addListenerOnce(map, 'idle', () => {
          if (!cancelled && map.getZoom() && map.getZoom()! > 17) {
            map.setZoom(17)
          }
        })

        setMapError(null)
      } catch (error) {
        console.error('Reveal map error:', error)

        if (!cancelled) {
          setMapError('Reveal map could not be loaded.')
        }
      }
    }

    loadRevealMap()

    return () => {
      cancelled = true
    }
  }, [currentRound, party?.activeMatch?.updatedAt, target.id, target.lat, target.lng, user?.id])

  async function handleAdvance() {
    if (isPartyMatch && partyCode && user) {
      await advancePartyMatch(partyCode, user.id)
      return
    }

    navigate('/final-result', {
      state: {
        matchId: generateMatchId(),
        totalScore: updatedTotalScore,
        roundCount,
        roundTime,
        mode,
        matchType,
        teamWinner: teamSnapshot?.winningTeam ?? party?.activeMatch?.winnerTeam ?? null,
        teamPoints: teamSnapshot
          ? { red: teamSnapshot.redPoints, black: teamSnapshot.blackPoints }
          : party?.activeMatch?.teamPoints ?? null,
        roundResults: state?.roundResults ?? [],
      },
    })
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

      <section className="hero result-hero">
        <p className="eyebrow">
          Round {currentRound} of {totalRounds}
        </p>
        <h1>{isLastRound ? 'Match complete' : 'Round complete'}</h1>
        <p className="hero-copy">
          {isLastRound
            ? 'Everyone has guessed. Here is the reveal before the match summary.'
            : timedOut && !hasGuess
              ? 'Time ran out with no guess. Here is the reveal before the next round begins.'
              : 'Everyone has guessed. Here is the reveal before the next round begins.'}
        </p>

        <div className="result-map-shell">
          <div className="result-map-header">
            <span>Reveal map</span>
            <strong>{target.name}</strong>
          </div>

          <div ref={mapRef} className="result-map" />

          {mapError ? (
            <div className="result-map-fallback">{mapError}</div>
          ) : null}
        </div>

        <div className="result-summary-row">
          {matchType === 'team-duel' && teamSnapshot ? (
            <>
              <div className="result-stat-card">
                <span>Red distance</span>
                <strong>
                  {teamSnapshot.redDistanceKm !== null ? `${teamSnapshot.redDistanceKm} km` : 'No guess'}
                </strong>
              </div>
              <div className="result-stat-card">
                <span>Black distance</span>
                <strong>
                  {teamSnapshot.blackDistanceKm !== null ? `${teamSnapshot.blackDistanceKm} km` : 'No guess'}
                </strong>
              </div>
            </>
          ) : (
            <div className="result-stat-card">
              <span>Distance</span>
              <strong>{hasGuess ? `${roundedDistance} km` : 'No guess'}</strong>
            </div>
          )}
          {matchType === 'team-duel' && teamSnapshot ? (
            <div className="result-stat-card">
              <span>Round damage</span>
              <strong>{teamSnapshot.roundDamage}</strong>
            </div>
          ) : null}
          {matchType === 'regular' ? (
            <div className="result-stat-card">
              <span>Round score</span>
              <strong>{score}</strong>
            </div>
          ) : null}
          {matchType === 'regular' && currentStanding ? (
            <div className="result-stat-card">
              <span>Placement</span>
              <strong>
                {currentStanding.placement}/{standings.length}
              </strong>
            </div>
          ) : null}
          {matchType === 'regular' ? (
            <div className="result-stat-card">
              <span>Total score</span>
              <strong>{updatedTotalScore}</strong>
            </div>
          ) : null}
        </div>

        {matchType === 'team-duel' && teamSnapshot ? (
          <div className="result-summary-row">
            <div className="result-stat-card">
              <span>Red Team HP</span>
              <strong>{teamSnapshot.redPoints}</strong>
            </div>
            <div className="result-stat-card">
              <span>Black Team HP</span>
              <strong>{teamSnapshot.blackPoints}</strong>
            </div>
            <div className="result-stat-card">
              <span>Multiplier</span>
              <strong>{teamSnapshot.multiplier}x</strong>
            </div>
            <div className="result-stat-card">
              <span>Round winner</span>
              <strong>
                {teamSnapshot.winningTeam
                  ? `${formatTeamName(teamSnapshot.winningTeam)} Team`
                  : 'Tied'}
              </strong>
            </div>
          </div>
        ) : null}

        {partyMembers.length > 1 ? (
          <section className="players-panel result-placements-panel">
            <div className="players-header">
              <h2>{matchType === 'team-duel' ? 'Team leaderboard' : 'Round placements'}</h2>
              <span>Party {partyCode}</span>
            </div>

            <div className="player-list result-player-list">
              {matchType === 'team-duel' && teamSnapshot ? (
                <>
                  <div className="player-card room-player-card result-player-card">
                    <div>
                      <p className="player-name">Red Team</p>
                      <p className="player-status">
                        {teamSnapshot.redChosenDisplayName
                          ? `Anchor: ${teamSnapshot.redChosenDisplayName}`
                          : 'No guess this round'}
                      </p>
                    </div>

                    <div className="result-player-stats">
                      <span>
                        {teamSnapshot.redDistanceKm !== null ? `${teamSnapshot.redDistanceKm} km` : 'No guess'}
                      </span>
                      <strong>{teamSnapshot.redRoundScore}</strong>
                      <small>Total HP {teamSnapshot.redPoints}</small>
                    </div>
                  </div>

                  <div className="player-card room-player-card result-player-card">
                    <div>
                      <p className="player-name">Black Team</p>
                      <p className="player-status">
                        {teamSnapshot.blackChosenDisplayName
                          ? `Anchor: ${teamSnapshot.blackChosenDisplayName}`
                          : 'No guess this round'}
                      </p>
                    </div>

                    <div className="result-player-stats">
                      <span>
                        {teamSnapshot.blackDistanceKm !== null ? `${teamSnapshot.blackDistanceKm} km` : 'No guess'}
                      </span>
                      <strong>{teamSnapshot.blackRoundScore}</strong>
                      <small>Total HP {teamSnapshot.blackPoints}</small>
                    </div>
                  </div>
                </>
              ) : (
                standings.map((standing) => (
                  <div
                    key={standing.userId}
                    className={
                      standing.userId === user?.id
                        ? 'player-card room-player-card result-player-card current-player-card'
                        : 'player-card room-player-card result-player-card'
                    }
                  >
                    <div>
                      <p className="player-name">
                        #{standing.placement} {standing.displayName}
                        {standing.userId === user?.id ? ' (You)' : ''}
                      </p>
                      <p className="player-status">
                        {standing.guessed ? `${standing.distanceKm} km away` : 'No guess this round'}
                      </p>
                    </div>

                    <div className="result-player-stats">
                      <span>{standing.guessed ? `${standing.distanceKm} km` : 'No guess'}</span>
                      <strong>{standing.score}</strong>
                      <small>Total {partyTotals[standing.userId] ?? 0}</small>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}

        <div className="hero-actions">
          {isPartyMatch && user && party?.leaderId !== user.id ? (
            <button type="button" className="ghost-button" disabled>
              Waiting for leader
            </button>
          ) : (
            <button type="button" onClick={() => void handleAdvance()}>
              {isLastRound ? 'View final score' : 'Next round'}
            </button>
          )}

          <Link to="/" className="button-link secondary">
            Home
          </Link>
        </div>
      </section>
    </main>
  )
}
