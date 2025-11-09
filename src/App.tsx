import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import ChickenHop from '../games/chicken-hop/ChickenHop'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/games/chicken-hop" element={<ChickenHop />} />
    </Routes>
  )
}

export default App
