import { useEffect, useRef, useState } from 'react'
import './ChickenHop.css'

interface Platform {
  x: number
  y: number
  distance: 1 | 2 | 3
}

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600
const CHICKEN_SIZE = 40
const PLATFORM_WIDTH = 80
const PLATFORM_HEIGHT = 20
const GRAVITY = 0.8
const HOP_VELOCITIES = [0, -12, -16, -20] // [no hop, 1 unit, 2 units, 3 units]
const UNIT_DISTANCE = 100

function ChickenHop() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('chickenHopHighScore')
    return saved ? parseInt(saved) : 0
  })
  const [gameOver, setGameOver] = useState(false)
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'pending'>('pending')

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)

  const chickenRef = useRef({ x: 100, y: 300, velocityY: 0, velocityX: 0 })
  const platformsRef = useRef<Platform[]>([])
  const cameraXRef = useRef(0)
  const animationRef = useRef<number>()

  useEffect(() => {
    const loadHighScore = () => {
      const saved = localStorage.getItem('chickenHopHighScore')
      if (saved) setHighScore(parseInt(saved))
    }
    loadHighScore()
  }, [])

  const initMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream

      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      const microphone = audioContext.createMediaStreamSource(stream)

      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      microphone.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser
      setMicPermission('granted')
    } catch (err) {
      console.error('Microphone access denied:', err)
      setMicPermission('denied')
    }
  }

  const getVolume = (): number => {
    if (!analyserRef.current) return 0

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)

    const sum = dataArray.reduce((a, b) => a + b, 0)
    return sum / dataArray.length
  }

  const initGame = () => {
    chickenRef.current = { x: 100, y: 300, velocityY: 0, velocityX: 2 }
    cameraXRef.current = 0

    platformsRef.current = [{ x: 0, y: 400, distance: 1 }]

    let lastX = 0
    for (let i = 0; i < 15; i++) {
      const distance = [1, 2, 3][Math.floor(Math.random() * 3)] as 1 | 2 | 3
      lastX += UNIT_DISTANCE * distance
      const y = 400 - Math.random() * 150
      platformsRef.current.push({ x: lastX, y, distance })
    }

    setScore(0)
    setGameOver(false)
    setIsPlaying(true)
  }

  const startGame = async () => {
    if (micPermission === 'pending') {
      await initMicrophone()
    }
    if (micPermission !== 'denied') {
      initGame()
    }
  }

  const restartGame = () => {
    initGame()
  }

  useEffect(() => {
    if (!isPlaying || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let lastHopTime = 0
    const HOP_COOLDOWN = 300

    const gameLoop = () => {
      const chicken = chickenRef.current
      const platforms = platformsRef.current

      // Get microphone volume
      const volume = getVolume()

      // Determine hop strength based on volume thresholds
      const now = Date.now()
      let hopStrength = 0
      if (now - lastHopTime > HOP_COOLDOWN) {
        if (volume > 60) hopStrength = 3
        else if (volume > 40) hopStrength = 2
        else if (volume > 25) hopStrength = 1

        if (hopStrength > 0 && chicken.velocityY === 0) {
          chicken.velocityY = HOP_VELOCITIES[hopStrength]
          lastHopTime = now
        }
      }

      // Apply gravity
      chicken.velocityY += GRAVITY
      chicken.y += chicken.velocityY
      chicken.x += chicken.velocityX

      // Check platform collisions
      let onPlatform = false
      for (const platform of platforms) {
        if (
          chicken.velocityY >= 0 &&
          chicken.x + CHICKEN_SIZE > platform.x &&
          chicken.x < platform.x + PLATFORM_WIDTH &&
          chicken.y + CHICKEN_SIZE >= platform.y &&
          chicken.y + CHICKEN_SIZE <= platform.y + PLATFORM_HEIGHT + 10
        ) {
          chicken.y = platform.y - CHICKEN_SIZE
          chicken.velocityY = 0
          onPlatform = true

          // Update score when landing on a new platform
          const platformIndex = platforms.indexOf(platform)
          if (platformIndex > score) {
            setScore(platformIndex)
          }
        }
      }

      // Camera follows chicken
      cameraXRef.current = chicken.x - 200

      // Generate new platforms
      const lastPlatform = platforms[platforms.length - 1]
      if (lastPlatform.x < chicken.x + CANVAS_WIDTH) {
        const distance = [1, 2, 3][Math.floor(Math.random() * 3)] as 1 | 2 | 3
        const newX = lastPlatform.x + UNIT_DISTANCE * distance
        const newY = 400 - Math.random() * 150
        platforms.push({ x: newX, y: newY, distance })
      }

      // Remove off-screen platforms
      platformsRef.current = platforms.filter(p => p.x > cameraXRef.current - 200)

      // Check game over
      if (chicken.y > CANVAS_HEIGHT) {
        setGameOver(true)
        setIsPlaying(false)

        if (score > highScore) {
          setHighScore(score)
          localStorage.setItem('chickenHopHighScore', score.toString())
        }
        return
      }

      // Draw
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // Draw sky gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
      gradient.addColorStop(0, '#87CEEB')
      gradient.addColorStop(1, '#E0F6FF')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // Draw platforms
      ctx.fillStyle = '#8B4513'
      for (const platform of platforms) {
        const screenX = platform.x - cameraXRef.current
        ctx.fillRect(screenX, platform.y, PLATFORM_WIDTH, PLATFORM_HEIGHT)
        ctx.fillStyle = '#90EE90'
        ctx.fillRect(screenX, platform.y - 5, PLATFORM_WIDTH, 5)
        ctx.fillStyle = '#8B4513'
      }

      // Draw chicken
      const chickenScreenX = chicken.x - cameraXRef.current
      ctx.fillStyle = '#FFD700'
      ctx.fillRect(chickenScreenX, chicken.y, CHICKEN_SIZE, CHICKEN_SIZE)

      // Draw chicken details
      ctx.fillStyle = '#FF6347'
      ctx.fillRect(chickenScreenX - 8, chicken.y + 5, 8, 8) // comb
      ctx.fillStyle = '#FFA500'
      ctx.fillRect(chickenScreenX + CHICKEN_SIZE / 2 - 5, chicken.y + 20, 10, 8) // beak
      ctx.fillStyle = '#000'
      ctx.fillRect(chickenScreenX + 10, chicken.y + 10, 5, 5) // eye

      // Draw volume indicator
      const indicatorHeight = (volume / 100) * 50
      ctx.fillStyle = volume > 60 ? '#00FF00' : volume > 40 ? '#FFFF00' : volume > 25 ? '#FFA500' : '#888'
      ctx.fillRect(10, CANVAS_HEIGHT - 60, 20, -indicatorHeight)
      ctx.strokeStyle = '#333'
      ctx.strokeRect(10, CANVAS_HEIGHT - 60, 20, -50)

      animationRef.current = requestAnimationFrame(gameLoop)
    }

    gameLoop()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPlaying, score, highScore])

  useEffect(() => {
    return () => {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop())
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  return (
    <div className="chicken-hop">
      <div className="game-header">
        <a href="/" className="back-button">← Back to Games</a>
        <h1>🐔 Chicken Hop</h1>
        <div className="scores">
          <div>Score: {score}</div>
          <div>High Score: {highScore}</div>
        </div>
      </div>

      <div className="game-container">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="game-canvas"
        />

        {!isPlaying && !gameOver && (
          <div className="game-overlay">
            <h2>Cluck to Hop!</h2>
            <p>Make sounds into your microphone to hop across platforms</p>
            <ul>
              <li>Soft cluck = 1 unit hop</li>
              <li>Medium cluck = 2 unit hop</li>
              <li>Loud cluck = 3 unit hop</li>
            </ul>
            {micPermission === 'denied' && (
              <p className="error">Microphone access denied. Please enable it to play.</p>
            )}
            <button onClick={startGame} className="start-button">
              Start Game
            </button>
          </div>
        )}

        {gameOver && (
          <div className="game-overlay">
            <h2>Game Over!</h2>
            <p>Score: {score}</p>
            {score > highScore && <p className="new-high-score">New High Score! 🎉</p>}
            <button onClick={restartGame} className="start-button">
              Play Again
            </button>
          </div>
        )}
      </div>

      <div className="instructions">
        <h3>How to Play</h3>
        <p>Cluck into your microphone to make the chicken hop. Match your cluck volume to the platform distance!</p>
      </div>
    </div>
  )
}

export default ChickenHop
