import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { appendStoredMatchResult, loadCurrentAppState } from '../lib/auth'
import { buildFinalMatchStateFromParty, buildGameRouteStateFromParty, buildResultRouteStateFromParty } from '../lib/matchResume'
import { formatTeamName, leaveParty, resetPartyToLobby } from '../lib/party'

type FinalResultState = {
  matchId: string
  totalScore: number
  roundCount: string
  roundTime: string
  mode: 'moving' | 'non-moving'
  matchType?: 'regular' | 'team-duel'
  teamWinner?: 'red' | 'black' | null
  teamPoints?: { red: number; black: number } | null
  partyCode?: string
  roundResults?: {
    roundNumber: number
    targetName: string
    distanceKm: number
    score: number
    guessed: boolean
  }[]
  finalPlacements?: {
    userId: string
    displayName: string
    team: 'red' | 'black'
    totalScore: number
    isCurrentUser: boolean
  }[]
}

export function FinalResultPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const state = location.state as FinalResultState | null

  const matchId = state?.matchId ?? 'LOCAL-MATCH'
  const totalScore = state?.totalScore ?? 0
  const roundCount = state?.roundCount ?? '5'
  const roundTime = state?.roundTime ?? '60'
  const mode = state?.mode ?? 'moving'
  const matchType = state?.matchType ?? 'regular'
  const teamWinner = state?.teamWinner ?? null
  const teamPoints = state?.teamPoints ?? null
  const partyCode = state?.partyCode ?? null
  const roundResults = state?.roundResults ?? []
  const finalPlacements = state?.finalPlacements ?? []
  const roundsPlayed = roundResults.length || Number(roundCount)
  const guessedRounds = roundResults.filter((round) => round.guessed).length
  const averageScore =
    roundResults.length > 0
      ? Math.round(totalScore / roundResults.length)
      : 0
  const guessedRoundResults = roundResults.filter((round) => round.guessed)
  const bestRound =
    guessedRoundResults.length > 0
      ? guessedRoundResults.reduce((best, current) =>
          current.score > best.score ? current : best,
        )
      : null

  useEffect(() => {
    if (!user || state) {
      return
    }

    const currentUser = user
    let cancelled = false

    async function resumeWithoutState() {
      try {
        const appState = await loadCurrentAppState()
        if (cancelled || !appState.party || !appState.route) {
          navigate('/')
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

        navigate('/')
      } catch {
        navigate('/')
      }
    }

    void resumeWithoutState()

    return () => {
      cancelled = true
    }
  }, [navigate, state, user])

  useEffect(() => {
    if (!user || partyCode) {
      return
    }

    void appendStoredMatchResult(user, {
      id: matchId,
      totalScore,
      roundCount: roundsPlayed,
      roundTime: Number(roundTime),
      mode,
      matchType,
      playedAt: new Date().toISOString(),
    })
  }, [matchId, matchType, mode, partyCode, roundTime, roundsPlayed, totalScore, user])

  async function handlePlayAgain() {
    if (partyCode) {
      await resetPartyToLobby(partyCode)
      navigate('/room', { state: { partyCode } })
      return
    }

    navigate('/room', {
      state: {
        matchType,
        mode,
        roundTime,
        roundCount,
      },
    })
  }

  async function handleGoHome() {
    if (partyCode && user) {
      await leaveParty(partyCode, user.id)
    }

    navigate('/')
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

      <section className="hero result-hero final-hero">
        <p className="eyebrow">Match Summary</p>
        <h1>Final score</h1>
        <p className="hero-copy">
          You completed {roundsPlayed} rounds in{' '}
          {mode === 'non-moving' ? 'Non-moving' : 'Moving'} mode.
          {matchType === 'team-duel'
            ? ` Match type: Team Duel${teamWinner ? `, ${formatTeamName(teamWinner)} Team wins.` : '.'}`
            : ''}
        </p>

        {matchType === 'team-duel' ? (
          <>
            <div className="result-summary-row final-summary-row">
              <div className="result-stat-card">
                <span>Winning team</span>
                <strong>{teamWinner ? `${formatTeamName(teamWinner)} Team` : 'Tied'}</strong>
              </div>
              <div className="result-stat-card">
                <span>Red HP</span>
                <strong>{teamPoints?.red ?? 0}</strong>
              </div>
              <div className="result-stat-card">
                <span>Black HP</span>
                <strong>{teamPoints?.black ?? 0}</strong>
              </div>
              <div className="result-stat-card">
                <span>Rounds played</span>
                <strong>{roundsPlayed}</strong>
              </div>
            </div>

            <div className="setup-summary">
              <p>
                <strong>Mode:</strong> Team Duel
              </p>
              <p>
                <strong>Round time:</strong> {roundTime} seconds
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="result-summary-row final-summary-row">
              <div className="result-stat-card">
                <span>Total score</span>
                <strong>{totalScore}</strong>
              </div>
              <div className="result-stat-card">
                <span>Average round</span>
                <strong>{averageScore}</strong>
              </div>
              <div className="result-stat-card">
                <span>Guessed rounds</span>
                <strong>
                  {guessedRounds}/{roundsPlayed}
                </strong>
              </div>
            </div>

            <div className="setup-summary">
              <p>
                <strong>Best round:</strong> {bestRound ? `Round ${bestRound.roundNumber}` : 'None'}
              </p>
              <p>
                <strong>Round time:</strong> {roundTime} seconds
              </p>
            </div>

            <div className="final-results-panel">
              <div className="final-results-header">
                <span>Rank</span>
                <span>Player</span>
                <span>Total score</span>
              </div>

              <div className="final-results-list">
                {(finalPlacements.length > 0
                  ? finalPlacements
                  : [
                      {
                        userId: user?.id ?? 'solo-user',
                        displayName: user?.displayName ?? 'You',
                        team: 'red' as const,
                        totalScore,
                        isCurrentUser: true,
                      },
                    ]).map((entry, index) => (
                  <div key={entry.userId} className="final-results-row">
                    <span>#{index + 1}</span>
                    <strong>
                      {entry.displayName}
                      {entry.isCurrentUser ? ' (You)' : ''}
                    </strong>
                    <span>{entry.totalScore}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="hero-actions">
          <button type="button" onClick={() => void handlePlayAgain()}>
            Play again
          </button>
          <button type="button" className="button-link secondary" onClick={() => void handleGoHome()}>
            Home
          </button>
        </div>
      </section>
    </main>
  )
}
