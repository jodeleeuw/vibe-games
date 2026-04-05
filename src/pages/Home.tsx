import { Link } from 'react-router-dom'
import './Home.css'

function ChickenIllustration() {
  return (
    <svg viewBox="0 0 120 120" className="game-illustration" aria-hidden="true">
      {/* Body */}
      <ellipse cx="60" cy="72" rx="32" ry="28" fill="#ffd166" />
      {/* Wing */}
      <ellipse cx="38" cy="70" rx="14" ry="18" fill="#f0b930" transform="rotate(-10 38 70)" />
      {/* Head */}
      <circle cx="60" cy="40" r="18" fill="#ffd166" />
      {/* Comb */}
      <path d="M52 24 Q55 14 60 22 Q65 14 68 24" fill="#ef476f" strokeLinejoin="round" />
      {/* Eye */}
      <circle cx="66" cy="36" r="4" fill="#1a1a2e" />
      <circle cx="67.5" cy="34.5" r="1.5" fill="white" />
      {/* Beak */}
      <polygon points="78,40 88,44 78,48" fill="#ef8a3e" />
      {/* Legs */}
      <line x1="50" y1="98" x2="46" y2="112" stroke="#ef8a3e" strokeWidth="3" strokeLinecap="round" />
      <line x1="70" y1="98" x2="74" y2="112" stroke="#ef8a3e" strokeWidth="3" strokeLinecap="round" />
      {/* Feet */}
      <path d="M40 112 L46 112 L50 108" stroke="#ef8a3e" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M70 112 L74 112 L78 108" stroke="#ef8a3e" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Sound waves */}
      <path d="M92 36 Q98 32 92 28" stroke="#06d6a0" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7" />
      <path d="M96 40 Q104 34 96 24" stroke="#06d6a0" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

function SpellingIllustration() {
  return (
    <svg viewBox="0 0 120 120" className="game-illustration" aria-hidden="true">
      {/* Paper */}
      <rect x="20" y="14" width="70" height="92" rx="4" fill="var(--color-cream)" stroke="#ccc" strokeWidth="1.5" />
      {/* Lines on paper */}
      <line x1="30" y1="36" x2="80" y2="36" stroke="#ddd" strokeWidth="1" />
      <line x1="30" y1="48" x2="80" y2="48" stroke="#ddd" strokeWidth="1" />
      <line x1="30" y1="60" x2="80" y2="60" stroke="#ddd" strokeWidth="1" />
      <line x1="30" y1="72" x2="80" y2="72" stroke="#ddd" strokeWidth="1" />
      {/* "ie" text */}
      <text x="40" y="55" fontFamily="Fredoka, sans-serif" fontSize="28" fontWeight="700" fill="#118ab2">i</text>
      <text x="56" y="55" fontFamily="Fredoka, sans-serif" fontSize="16" fontWeight="500" fill="#ccc">/</text>
      <text x="64" y="55" fontFamily="Fredoka, sans-serif" fontSize="28" fontWeight="700" fill="#ef476f">e</text>
      {/* Pencil */}
      <g transform="translate(72, 18) rotate(35)">
        <rect x="0" y="0" width="10" height="60" rx="1" fill="#ffd166" />
        <rect x="0" y="0" width="10" height="8" rx="1" fill="#ef476f" />
        <polygon points="0,60 10,60 5,70" fill="#f5deb3" />
        <polygon points="3,66 7,66 5,70" fill="#333" />
      </g>
      {/* Checkmark */}
      <circle cx="85" cy="85" r="14" fill="#06d6a0" />
      <polyline points="78,85 83,90 93,80" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface Game {
  id: string
  title: string
  description: string
  path: string
  illustration: React.ReactNode
  accent: string
}

const games: Game[] = [
  {
    id: 'chicken-hop',
    title: 'Chicken Hop',
    description: 'Cluck into your microphone to make the chicken hop across platforms!',
    path: '/games/chicken-hop',
    illustration: <ChickenIllustration />,
    accent: 'var(--color-yellow)'
  },
  {
    id: 'spelling-ie',
    title: 'Spelling i/e',
    description: 'Listen to words and click the correct spelling with i or e!',
    path: '/games/spelling-ie',
    illustration: <SpellingIllustration />,
    accent: 'var(--color-blue)'
  }
]

function Home() {
  return (
    <div className="home">
      <header className="header">
        <h1>Vibe Games</h1>
        <p>Games for kids, made for fun</p>
      </header>

      <div className="games-grid">
        {games.map(game => (
          <Link
            key={game.id}
            to={game.path}
            className="game-card"
            style={{ '--card-accent': game.accent } as React.CSSProperties}
          >
            <div className="game-illustration-wrap">
              {game.illustration}
            </div>
            <h2>{game.title}</h2>
            <p>{game.description}</p>
            <span className="play-button">Play</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default Home
