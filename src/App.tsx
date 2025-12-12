import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import ChickenHop from '../games/chicken-hop/ChickenHop'
import SpellingIE from '../games/spelling-ie/SpellingIE'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/games/chicken-hop" element={<ChickenHop />} />
      <Route path="/games/spelling-ie" element={<SpellingIE />} />
    </Routes>
  )
}

export default App
