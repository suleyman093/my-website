import { Navigate, Route, Routes } from 'react-router-dom'
import { AccountPage } from './pages/AccountPage'
import { FinalResultPage } from './pages/FinalResultPage'
import { GamePage } from './pages/GamePage'
import { HomePage } from './pages/HomePage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { LoginPage } from './pages/LoginPage'
import { PlayPage } from './pages/PlayPage'
import { ResultPage } from './pages/ResultPage'
import { RoomPage } from './pages/RoomPage'
import './styles/app.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
      <Route path="/play" element={<PlayPage />} />
      <Route path="/room" element={<RoomPage />} />
      <Route path="/game" element={<GamePage />} />
      <Route path="/result" element={<ResultPage />} />
      <Route path="/final-result" element={<FinalResultPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
