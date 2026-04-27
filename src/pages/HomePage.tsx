import { Link, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { loadCurrentAppState } from '../lib/auth'
import {
  buildFinalMatchStateFromParty,
  buildGameRouteStateFromParty,
  buildResultRouteStateFromParty,
} from '../lib/matchResume'

export function HomePage() {
  const { user } = useAuth()
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

  return (
    <main className="app-shell home-screen">
      <div className="home-stars" aria-hidden="true" />
      <div className="home-stars home-stars-secondary" aria-hidden="true" />
      <div className="space-planets" aria-hidden="true">
        <div className="space-planet planet-one" />
        <div className="space-planet planet-two" />
        <div className="space-planet planet-three" />
        <div className="space-planet planet-four" />
      </div>
      <div className="home-earth-wrap" aria-hidden="true">
        <div className="home-earth-glow" />
        <div className="home-earth" />
      </div>

      <section className="hero home-hero">
        <p className="eyebrow">MueyyenSayt</p>
        <h1>Multiplayer geography game</h1>
        <p className="hero-copy">
          Drop into a mystery location, race the clock, and see who guesses closest.
        </p>

        {user ? (
          <div className="home-user-banner">
            <span>{user.isGuest ? 'Guest player' : 'Signed in'}</span>
            <strong>{user.displayName}</strong>
            <small>{user.id}</small>
          </div>
        ) : null}

        <div className="hero-actions">
          <Link to="/play" className="button-link">
            Play
          </Link>
          <Link to={user ? '/account' : '/login'} className="button-link secondary">
            {user ? 'Account' : 'Login'}
          </Link>
          <Link to="/leaderboard" className="button-link secondary">
            Leaderboard
          </Link>
        </div>
      </section>
    </main>
  )
}
