import { useEffect, useRef, useState } from 'react'
import './ChickenHop.css'

interface Platform {
  x: number
  y: number
  distance: 1 | 2 | 3
  id: number // Unique sequential ID
}

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600
const CHICKEN_SIZE = 40
const PLATFORM_WIDTH = 80
const PLATFORM_HEIGHT = 20
const PLATFORM_Y = 400 // Fixed platform Y position
const UNIT_DISTANCE = 120
const JUMP_ANIMATION_DURATION = 300 // milliseconds for jump animation (faster)

// Volume thresholds (lowered for easier gameplay)
const VOLUME_THRESHOLD_1 = 15 // Short hop
const VOLUME_THRESHOLD_2 = 30 // Medium hop
const VOLUME_THRESHOLD_3 = 50 // Long hop

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
  const soundEffectGateRef = useRef(0) // Timestamp to ignore mic input after sounds

  const chickenRef = useRef({
    x: 100,
    y: PLATFORM_Y - CHICKEN_SIZE,
    isJumping: false,
    isFalling: false,
    fallStartTime: 0,
    jumpStartTime: 0,
    jumpStartX: 0,
    jumpEndX: 0,
    jumpDistance: 0 as 0 | 1 | 2 | 3,
    targetPlatformId: 0
  })
  const platformsRef = useRef<Platform[]>([])
  const currentPlatformIdRef = useRef(0)
  const nextPlatformIdRef = useRef(1)
  const cameraXRef = useRef(0)
  const animationRef = useRef<number>()
  const jumpFeedbackTimerRef = useRef<number>(0)
  const difficultyProgressRef = useRef(0)

  useEffect(() => {
    const loadHighScore = () => {
      const saved = localStorage.getItem('chickenHopHighScore')
      if (saved) setHighScore(parseInt(saved))
    }
    loadHighScore()
  }, [])

  const initMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false
        }
      })
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

  const playSoundEffect = (frequency: number, duration: number) => {
    if (!audioContextRef.current) return

    const now = Date.now()
    soundEffectGateRef.current = now + 250 // Block mic input for 250ms

    const ctx = audioContextRef.current
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.frequency.value = frequency
    oscillator.type = 'sine'

    // Envelope for pleasant sound
    const currentTime = ctx.currentTime
    gainNode.gain.setValueAtTime(0, currentTime)
    gainNode.gain.linearRampToValueAtTime(0.15, currentTime + 0.01) // Quick attack
    gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + duration) // Decay

    oscillator.start(currentTime)
    oscillator.stop(currentTime + duration)
  }

  const playJumpSound = (distance: 1 | 2 | 3) => {
    const frequencies = [523, 659, 784] // C5, E5, G5 - pleasant major chord tones
    playSoundEffect(frequencies[distance - 1], 0.15)
  }

  const playLandSound = () => {
    playSoundEffect(262, 0.1) // C4 - low satisfying thud
  }

  const playFallSound = () => {
    // Descending tone
    if (!audioContextRef.current) return

    const now = Date.now()
    soundEffectGateRef.current = now + 250

    const ctx = audioContextRef.current
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    const currentTime = ctx.currentTime
    oscillator.frequency.setValueAtTime(440, currentTime) // A4
    oscillator.frequency.exponentialRampToValueAtTime(110, currentTime + 0.4) // A2
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(0.1, currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.4)

    oscillator.start(currentTime)
    oscillator.stop(currentTime + 0.4)
  }

  const getVolume = (): number => {
    if (!analyserRef.current) return 0

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)

    const sum = dataArray.reduce((a, b) => a + b, 0)
    return sum / dataArray.length
  }

  const initGame = () => {
    // Create platforms at fixed Y position with precise spacing
    // ID represents position in sequence, accounting for gaps
    // Start with mostly gaps of 1, gradually introduce larger gaps
    const firstPlatformX = 100
    platformsRef.current = [{ x: firstPlatformX, y: PLATFORM_Y, distance: 1, id: 0 }]

    chickenRef.current = {
      x: firstPlatformX + PLATFORM_WIDTH / 2 - CHICKEN_SIZE / 2,
      y: PLATFORM_Y - CHICKEN_SIZE,
      isJumping: false,
      isFalling: false,
      fallStartTime: 0,
      jumpStartTime: 0,
      jumpStartX: 0,
      jumpEndX: 0,
      jumpDistance: 0,
      targetPlatformId: 0
    }
    cameraXRef.current = chickenRef.current.x - 200
    currentPlatformIdRef.current = 0
    nextPlatformIdRef.current = 1
    jumpFeedbackTimerRef.current = 0
    difficultyProgressRef.current = 0

    let lastX = firstPlatformX
    let positionId = 0
    for (let i = 0; i < 30; i++) {
      // Progressive difficulty: first 10 platforms are all gap=1, then gradually introduce 2 and 3
      let distance: 1 | 2 | 3
      if (i < 10) {
        distance = 1 // Easy start - all single gaps
      } else if (i < 20) {
        distance = Math.random() < 0.7 ? 1 : 2 // Mostly 1s, some 2s
      } else {
        distance = [1, 1, 2, 3][Math.floor(Math.random() * 4)] as 1 | 2 | 3 // Mix of all
      }

      lastX += UNIT_DISTANCE * distance
      positionId += distance // ID increments by gap size
      platformsRef.current.push({ x: lastX, y: PLATFORM_Y, distance, id: positionId })
    }
    nextPlatformIdRef.current = positionId + 1

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
    const HOP_COOLDOWN = 350 // Faster cooldown for quicker gameplay
    let soundActive = false // Track if we're currently in a sound
    let peakVolume = 0 // Track peak volume during current sound

    const gameLoop = () => {
      const chicken = chickenRef.current
      const platforms = platformsRef.current
      const currentPlatformId = currentPlatformIdRef.current

      // Get microphone volume
      const volume = getVolume()
      const now = Date.now()

      // Peak detection: detect rising edge and falling edge of sound
      if (!chicken.isJumping && !chicken.isFalling && now > soundEffectGateRef.current && now - lastHopTime > HOP_COOLDOWN) {
        if (volume > VOLUME_THRESHOLD_1) {
          // Sound is active - track peak
          soundActive = true
          peakVolume = Math.max(peakVolume, volume)
        } else if (soundActive) {
          // Sound just ended (falling edge) - trigger jump based on peak
          soundActive = false

          let hopStrength = 0
          if (peakVolume > VOLUME_THRESHOLD_3) hopStrength = 3
          else if (peakVolume > VOLUME_THRESHOLD_2) hopStrength = 2
          else if (peakVolume > VOLUME_THRESHOLD_1) hopStrength = 1

          peakVolume = 0 // Reset peak

          if (hopStrength > 0) {
            // Always jump when player clucks - calculate target position
            const targetPlatformId = currentPlatformId + hopStrength
            const targetPlatform = platforms.find(p => p.id === targetPlatformId)

            // Calculate end X position (to platform if it exists, or estimated position if not)
            const targetX = targetPlatform
              ? targetPlatform.x + PLATFORM_WIDTH / 2 - CHICKEN_SIZE / 2
              : chicken.x + (UNIT_DISTANCE * hopStrength)

            // Start jump animation regardless of whether platform exists
            chicken.isJumping = true
            chicken.jumpStartTime = now
            chicken.jumpStartX = chicken.x
            chicken.jumpEndX = targetX
            chicken.jumpDistance = hopStrength as 1 | 2 | 3
            chicken.targetPlatformId = targetPlatformId

            // Play jump sound
            playJumpSound(hopStrength as 1 | 2 | 3)

            // Set feedback timer
            jumpFeedbackTimerRef.current = now + 500

            lastHopTime = now
          }
        }
      }

      // Animate jump
      if (chicken.isJumping) {
        const elapsed = now - chicken.jumpStartTime
        const progress = Math.min(elapsed / JUMP_ANIMATION_DURATION, 1)

        // Horizontal interpolation (linear)
        chicken.x = chicken.jumpStartX + (chicken.jumpEndX - chicken.jumpStartX) * progress

        // Vertical arc (parabola)
        const jumpHeight = 80 + (chicken.jumpDistance * 20) // Higher jumps for longer distances
        chicken.y = PLATFORM_Y - CHICKEN_SIZE - (Math.sin(progress * Math.PI) * jumpHeight)

        // Check if jump animation is complete
        if (progress >= 1) {
          // Check if we landed on a platform at the target position
          const targetPlatform = platforms.find(p => p.id === chicken.targetPlatformId)

          if (targetPlatform) {
            // Successful landing
            chicken.x = targetPlatform.x + PLATFORM_WIDTH / 2 - CHICKEN_SIZE / 2
            chicken.y = PLATFORM_Y - CHICKEN_SIZE
            chicken.isJumping = false
            chicken.jumpDistance = 0
            currentPlatformIdRef.current = chicken.targetPlatformId
            setScore(chicken.targetPlatformId)

            // Play landing sound
            playLandSound()
          } else {
            // Missed - start falling animation
            chicken.isJumping = false
            chicken.isFalling = true
            chicken.fallStartTime = now
            chicken.jumpDistance = 0

            // Play fall sound
            playFallSound()
          }
        }
      }

      // Animate falling
      const FALL_DURATION = 800 // milliseconds
      if (chicken.isFalling) {
        const fallElapsed = now - chicken.fallStartTime
        const fallProgress = Math.min(fallElapsed / FALL_DURATION, 1)

        // Accelerating fall
        chicken.y = PLATFORM_Y - CHICKEN_SIZE + (fallProgress * fallProgress * CANVAS_HEIGHT)

        if (fallProgress >= 1) {
          // Fall animation complete - game over
          setGameOver(true)
          setIsPlaying(false)
          if (score > highScore) {
            setHighScore(score)
            localStorage.setItem('chickenHopHighScore', score.toString())
          }
          return
        }
      }

      // Smooth camera scrolling - keep chicken at fixed screen position
      cameraXRef.current = chicken.x - 200

      // Generate new platforms with progressive difficulty
      const lastPlatform = platforms[platforms.length - 1]
      if (lastPlatform.x < chicken.x + CANVAS_WIDTH * 2) {
        // Difficulty increases based on score
        let distance: 1 | 2 | 3
        if (score < 10) {
          distance = 1 // Easy: all single gaps
        } else if (score < 20) {
          distance = Math.random() < 0.7 ? 1 : 2 // Medium: mostly 1s, some 2s
        } else if (score < 40) {
          distance = [1, 1, 2, 3][Math.floor(Math.random() * 4)] as 1 | 2 | 3 // Hard: mix
        } else {
          distance = [1, 2, 2, 3][Math.floor(Math.random() * 4)] as 1 | 2 | 3 // Very hard: more 2s and 3s
        }

        const newX = lastPlatform.x + UNIT_DISTANCE * distance
        const newId = lastPlatform.id + distance // ID increments by gap size
        platforms.push({ x: newX, y: PLATFORM_Y, distance, id: newId })
        nextPlatformIdRef.current = newId + 1
      }

      // Remove off-screen platforms
      platformsRef.current = platforms.filter(p => p.x > cameraXRef.current - 200)

      // Check game over (fell off screen or missed platform)
      if (chicken.y > CANVAS_HEIGHT || (chicken.isJumping && chicken.x > platforms[platforms.length - 1].x + PLATFORM_WIDTH)) {
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

      // Draw background grid for depth perception
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
      ctx.lineWidth = 1
      const gridStartX = Math.floor(cameraXRef.current / UNIT_DISTANCE) * UNIT_DISTANCE
      for (let x = gridStartX; x < cameraXRef.current + CANVAS_WIDTH; x += UNIT_DISTANCE) {
        const screenX = x - cameraXRef.current
        ctx.beginPath()
        ctx.moveTo(screenX, 0)
        ctx.lineTo(screenX, CANVAS_HEIGHT)
        ctx.stroke()
      }

      // Draw ground line
      ctx.strokeStyle = 'rgba(139, 69, 19, 0.3)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, PLATFORM_Y)
      ctx.lineTo(CANVAS_WIDTH, PLATFORM_Y)
      ctx.stroke()

      // Draw gap indicators between platforms
      for (let i = 0; i < platforms.length - 1; i++) {
        const currentPlat = platforms[i]
        const nextPlat = platforms[i + 1]
        const gapStartX = currentPlat.x + PLATFORM_WIDTH - cameraXRef.current
        const gapEndX = nextPlat.x - cameraXRef.current
        const gapWidth = nextPlat.distance

        // Only draw if visible
        if (gapEndX < 0 || gapStartX > CANVAS_WIDTH) continue

        // Draw danger zone (the gap)
        ctx.fillStyle = 'rgba(255, 0, 0, 0.05)'
        ctx.fillRect(gapStartX, PLATFORM_Y, gapEndX - gapStartX, CANVAS_HEIGHT - PLATFORM_Y)

        // Draw arc showing gap distance
        const arcCenterX = (gapStartX + gapEndX) / 2
        const arcY = PLATFORM_Y + 40
        ctx.strokeStyle = `rgba(0, 0, 0, 0.4)`
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.arc(arcCenterX, arcY, (gapEndX - gapStartX) / 2 - 10, 0, Math.PI, true)
        ctx.stroke()
        ctx.setLineDash([])

        // Draw gap number
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
        ctx.font = 'bold 18px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${gapWidth}`, arcCenterX, arcY)
      }

      // Draw platforms
      for (let i = 0; i < platforms.length; i++) {
        const platform = platforms[i]
        const screenX = platform.x - cameraXRef.current

        // Only draw platforms visible on screen
        if (screenX < -PLATFORM_WIDTH || screenX > CANVAS_WIDTH) continue

        // Platform shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
        ctx.fillRect(screenX + 2, platform.y + 2, PLATFORM_WIDTH, PLATFORM_HEIGHT)

        // Platform base
        ctx.fillStyle = '#8B4513'
        ctx.fillRect(screenX, platform.y, PLATFORM_WIDTH, PLATFORM_HEIGHT)

        // Platform side detail
        ctx.fillStyle = '#654321'
        ctx.fillRect(screenX, platform.y + 5, PLATFORM_WIDTH, PLATFORM_HEIGHT - 5)

        // Grass top
        ctx.fillStyle = '#228B22'
        ctx.fillRect(screenX, platform.y - 5, PLATFORM_WIDTH, 5)

        // Grass blades
        ctx.fillStyle = '#2E8B57'
        for (let j = 0; j < 5; j++) {
          ctx.fillRect(screenX + j * 16 + 4, platform.y - 8, 2, 3)
        }
      }

      // Draw chicken (facing right)
      const chickenScreenX = chicken.x - cameraXRef.current
      ctx.fillStyle = '#FFD700'
      ctx.fillRect(chickenScreenX, chicken.y, CHICKEN_SIZE, CHICKEN_SIZE)

      // Draw chicken details (facing right)
      ctx.fillStyle = '#FF6347'
      ctx.fillRect(chickenScreenX + CHICKEN_SIZE, chicken.y + 5, 8, 8) // comb (on right side now)
      ctx.fillStyle = '#FFA500'
      ctx.fillRect(chickenScreenX + CHICKEN_SIZE / 2 - 5, chicken.y + 20, 10, 8) // beak (center)
      ctx.fillStyle = '#000'
      ctx.fillRect(chickenScreenX + CHICKEN_SIZE - 15, chicken.y + 10, 5, 5) // eye (on right side now)

      // Draw jump type feedback
      if (chicken.jumpDistance > 0 && now < jumpFeedbackTimerRef.current) {
        const jumpText = chicken.jumpDistance === 1 ? 'SHORT' : chicken.jumpDistance === 2 ? 'MEDIUM' : 'LONG'
        const jumpColor = chicken.jumpDistance === 1 ? '#90EE90' : chicken.jumpDistance === 2 ? '#87CEEB' : '#DDA0DD'

        ctx.save()
        ctx.fillStyle = jumpColor
        ctx.strokeStyle = '#000'
        ctx.lineWidth = 3
        ctx.font = 'bold 20px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.strokeText(jumpText, chickenScreenX + CHICKEN_SIZE / 2, chicken.y - 30)
        ctx.fillText(jumpText, chickenScreenX + CHICKEN_SIZE / 2, chicken.y - 30)
        ctx.restore()
      }

      // Draw volume indicator (discrete 3-level display)
      const level1Active = volume > VOLUME_THRESHOLD_1
      const level2Active = volume > VOLUME_THRESHOLD_2
      const level3Active = volume > VOLUME_THRESHOLD_3

      const barWidth = 25
      const barHeight = 12
      const barSpacing = 4
      const startX = 10
      const startY = CANVAS_HEIGHT - 60

      // Level 1 (bottom) - Green
      ctx.fillStyle = level1Active ? '#90EE90' : '#333'
      ctx.fillRect(startX, startY, barWidth, barHeight)
      ctx.strokeStyle = '#000'
      ctx.strokeRect(startX, startY, barWidth, barHeight)

      // Level 2 (middle) - Blue
      ctx.fillStyle = level2Active ? '#87CEEB' : '#333'
      ctx.fillRect(startX, startY - barHeight - barSpacing, barWidth, barHeight)
      ctx.strokeRect(startX, startY - barHeight - barSpacing, barWidth, barHeight)

      // Level 3 (top) - Purple
      ctx.fillStyle = level3Active ? '#DDA0DD' : '#333'
      ctx.fillRect(startX, startY - (barHeight + barSpacing) * 2, barWidth, barHeight)
      ctx.strokeRect(startX, startY - (barHeight + barSpacing) * 2, barWidth, barHeight)

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
            <p>Control your cluck volume to hop across platform gaps</p>
            <ul>
              <li>Soft cluck = hop 1 platform</li>
              <li>Medium cluck = hop 2 platforms</li>
              <li>Loud cluck = hop 3 platforms</li>
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
        <p>Cluck into your microphone to hop across platforms! Platforms are spaced 1, 2, or 3 units apart. Match your cluck volume to clear the gaps.</p>
      </div>
    </div>
  )
}

export default ChickenHop
