import { Link } from 'react-router-dom'
import './Home.css'

interface Game {
  id: string
  title: string
  description: string
  path: string
  emoji: string
}

const games: Game[] = [
  {
    id: 'chicken-hop',
    title: 'Chicken Hop',
    description: 'Cluck into your microphone to make the chicken hop across platforms!',
    path: '/games/chicken-hop',
    emoji: '🐔'
  }
]

function Home() {
  return (
    <div className="home">
      <header className="header">
        <h1>🎮 Vibe Games</h1>
        <p>Collection of fun browser games</p>
      </header>

      <div className="games-grid">
        {games.map(game => (
          <Link key={game.id} to={game.path} className="game-card">
            <div className="game-emoji">{game.emoji}</div>
            <h2>{game.title}</h2>
            <p>{game.description}</p>
            <button className="play-button">Play Now</button>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default Home
