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
const PLATFORM_Y = 400 // Fixed platform Y position
const UNIT_DISTANCE = 120
const JUMP_ANIMATION_DURATION = 300 // milliseconds for jump animation (faster)

// Base volume thresholds (scaled by sensitivity)
const BASE_THRESHOLD_1 = 15 // Short hop
const BASE_THRESHOLD_2 = 30 // Medium hop
const BASE_THRESHOLD_3 = 50 // Long hop
const BASE_THRESHOLD_BOOM = 80 // Too loud — chicken explodes!

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
  const [sensitivity, setSensitivity] = useState(() => {
    const saved = localStorage.getItem('chickenHopSensitivity')
    return saved ? parseFloat(saved) : 1.0
  })
  const previewAnimRef = useRef<number>()
  const needleRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const zoneRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null])
  const previewHopRef = useRef<HTMLDivElement>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const soundEffectGateRef = useRef(0) // Timestamp to ignore mic input after sounds

  const chickenRef = useRef({
    x: 100,
    y: PLATFORM_Y - CHICKEN_SIZE,
    isJumping: false,
    isFalling: false,
    isSplatted: false,
    splatTime: 0,
    isExploded: false,
    explodeTime: 0,
    fallStartTime: 0,
    jumpStartTime: 0,
    jumpStartX: 0,
    jumpEndX: 0,
    jumpDistance: 0 as 0 | 1 | 2 | 3,
    targetPlatformId: 0,
    bounceTime: 0,
  })
  const mudParticlesRef = useRef<{ x: number; y: number; vx: number; vy: number; r: number }[]>([])
  const featherParticlesRef = useRef<{ x: number; y: number; vx: number; vy: number; rot: number; rotV: number; color: string }[]>([])
  const platformsRef = useRef<Platform[]>([])
  const currentPlatformIdRef = useRef(0)
  const nextPlatformIdRef = useRef(1)
  const cameraXRef = useRef(0)
  const animationRef = useRef<number>()
  const jumpFeedbackTimerRef = useRef<number>(0)
  const difficultyProgressRef = useRef(0)
  const gameOverDelayRef = useRef(0)
  const gameOverTriggeredRef = useRef(false)

  useEffect(() => {
    const loadHighScore = () => {
      const saved = localStorage.getItem('chickenHopHighScore')
      if (saved) setHighScore(parseInt(saved))
    }
    loadHighScore()
    // Request mic on mount so sensitivity controls are immediately available
    initMicrophone()
  }, [])

  const micInitializedRef = useRef(false)

  const initMicrophone = async () => {
    if (micInitializedRef.current) return
    micInitializedRef.current = true
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
      analyser.smoothingTimeConstant = 0.6
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

  const getThresholds = () => {
    const scale = 1 / sensitivity
    return {
      t1: BASE_THRESHOLD_1 * scale,
      t2: BASE_THRESHOLD_2 * scale,
      t3: BASE_THRESHOLD_3 * scale,
      tBoom: BASE_THRESHOLD_BOOM * scale,
    }
  }

  const handleSensitivityChange = (value: number) => {
    setSensitivity(value)
    localStorage.setItem('chickenHopSensitivity', value.toString())
  }

  // Live volume preview on start screen — uses same peak detection as game loop
  useEffect(() => {
    if (isPlaying || micPermission !== 'granted') {
      if (previewAnimRef.current) cancelAnimationFrame(previewAnimRef.current)
      return
    }

    let soundActive = false
    let peakVolume = 0
    let lastHopTime = 0
    let detectedHop = 0
    let hopDisplayUntil = 0
    const HOP_COOLDOWN = 350

    const tick = () => {
      const vol = getVolume()
      const { t1, t2, t3, tBoom } = getThresholds()
      const maxDisplay = tBoom * 1.3
      const pct = Math.min((vol / maxDisplay) * 100, 100)
      const now = Date.now()

      // Update needle and fill in real-time
      if (needleRef.current) needleRef.current.style.left = `${pct}%`
      if (fillRef.current) fillRef.current.style.width = `${pct}%`

      // Peak detection — same algorithm as game loop
      if (now - lastHopTime > HOP_COOLDOWN) {
        if (vol > t1) {
          soundActive = true
          peakVolume = Math.max(peakVolume, vol)
        } else if (soundActive) {
          soundActive = false
          if (peakVolume > tBoom) detectedHop = 4 // boom!
          else if (peakVolume > t3) detectedHop = 3
          else if (peakVolume > t2) detectedHop = 2
          else if (peakVolume > t1) detectedHop = 1
          else detectedHop = 0
          peakVolume = 0
          if (detectedHop > 0) {
            hopDisplayUntil = now + 800
            lastHopTime = now
          }
        }
      }

      // Light up zones based on detected hop (4 = boom)
      const activeHop = now < hopDisplayUntil ? detectedHop : 0
      const dimColors = ['rgba(6,214,160,0.25)', 'rgba(17,138,178,0.25)', 'rgba(239,71,111,0.25)', 'rgba(255,80,20,0.2)']
      const litColors = ['rgba(6,214,160,0.75)', 'rgba(17,138,178,0.75)', 'rgba(239,71,111,0.75)', 'rgba(255,80,20,0.85)']
      for (let i = 0; i < 4; i++) {
        const el = zoneRefs.current[i]
        if (el) {
          el.style.background = activeHop >= i + 1 ? litColors[i] : dimColors[i]
        }
      }

      // Show hop label
      if (previewHopRef.current) {
        if (activeHop === 4) {
          previewHopRef.current.textContent = 'TOO LOUD!'
          previewHopRef.current.style.opacity = '1'
          previewHopRef.current.style.color = '#ff5014'
        } else if (activeHop > 0) {
          previewHopRef.current.textContent = `Hop ${activeHop}!`
          previewHopRef.current.style.opacity = '1'
          const colors = ['#06d6a0', '#118ab2', '#ef476f']
          previewHopRef.current.style.color = colors[activeHop - 1]
        } else {
          previewHopRef.current.style.opacity = '0'
        }
      }

      previewAnimRef.current = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      if (previewAnimRef.current) cancelAnimationFrame(previewAnimRef.current)
    }
  }, [isPlaying, micPermission, sensitivity])

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
      isSplatted: false,
      splatTime: 0,
      isExploded: false,
      explodeTime: 0,
      fallStartTime: 0,
      jumpStartTime: 0,
      jumpStartX: 0,
      jumpEndX: 0,
      jumpDistance: 0,
      targetPlatformId: 0,
      bounceTime: 0,
    }
    mudParticlesRef.current = []
    featherParticlesRef.current = []
    gameOverDelayRef.current = 0
    gameOverTriggeredRef.current = false
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
    // Mic may still be pending if user navigated here and permission dialog is slow
    if (micPermission === 'pending') {
      await initMicrophone()
    }
    if (micPermission === 'denied') return
    initGame()
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
      const { t1, t2, t3, tBoom } = getThresholds()
      if (!chicken.isJumping && !chicken.isFalling && !chicken.isSplatted && !chicken.isExploded && now > soundEffectGateRef.current && now - lastHopTime > HOP_COOLDOWN) {
        if (volume > t1) {
          // Sound is active - track peak
          soundActive = true
          peakVolume = Math.max(peakVolume, volume)
        } else if (soundActive) {
          // Sound just ended (falling edge) - trigger jump based on peak
          soundActive = false

          // Too loud — chicken explodes!
          if (peakVolume > tBoom) {
            peakVolume = 0
            chicken.isExploded = true
            chicken.explodeTime = now
            // Spawn feather particles
            featherParticlesRef.current = []
            const featherColors = ['#FFD166', '#e6b800', '#FFE599', '#ef476f', 'white']
            for (let fp = 0; fp < 20; fp++) {
              const angle = Math.random() * Math.PI * 2
              const speed = 3 + Math.random() * 6
              featherParticlesRef.current.push({
                x: chicken.x + CHICKEN_SIZE / 2,
                y: chicken.y + CHICKEN_SIZE / 2,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                rot: Math.random() * Math.PI * 2,
                rotV: (Math.random() - 0.5) * 0.3,
                color: featherColors[Math.floor(Math.random() * featherColors.length)],
              })
            }
            playFallSound()
            lastHopTime = now
            soundActive = false
          } else {
            let hopStrength = 0
            if (peakVolume > t3) hopStrength = 3
            else if (peakVolume > t2) hopStrength = 2
            else if (peakVolume > t1) hopStrength = 1

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
            jumpFeedbackTimerRef.current = now + 800

            lastHopTime = now
          }
          } // close else (not boom)
        }
      }

      // Animate explosion
      const EXPLODE_DURATION = 1000
      if (chicken.isExploded) {
        const explodeElapsed = now - chicken.explodeTime

        // Update feather particles
        for (const fp of featherParticlesRef.current) {
          fp.x += fp.vx
          fp.y += fp.vy
          fp.vy += 0.1 // gentle gravity
          fp.vx *= 0.99
          fp.rot += fp.rotV
        }

        if (explodeElapsed >= EXPLODE_DURATION && !gameOverTriggeredRef.current) {
          gameOverTriggeredRef.current = true
          gameOverDelayRef.current = now
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
            chicken.bounceTime = now
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

      // Animate falling — chicken arcs down into the mud
      const MUD_LAND_Y = PLATFORM_Y + 65 // Must match MUD_Y in draw section
      const FALL_DURATION = 400 // Faster fall into mud
      if (chicken.isFalling && !chicken.isSplatted) {
        const fallElapsed = now - chicken.fallStartTime
        const fallProgress = Math.min(fallElapsed / FALL_DURATION, 1)

        // Accelerating fall to mud level
        chicken.y = PLATFORM_Y - CHICKEN_SIZE + (fallProgress * fallProgress * (MUD_LAND_Y - PLATFORM_Y + CHICKEN_SIZE))

        if (fallProgress >= 1) {
          // Hit the mud — splat!
          chicken.isSplatted = true
          chicken.splatTime = now
          chicken.y = MUD_LAND_Y - CHICKEN_SIZE / 2

          // Spawn mud particles
          mudParticlesRef.current = []
          for (let p = 0; p < 16; p++) {
            const angle = -Math.PI * 0.1 - Math.random() * Math.PI * 0.8
            const speed = 2 + Math.random() * 5
            mudParticlesRef.current.push({
              x: chicken.x + CHICKEN_SIZE / 2,
              y: MUD_LAND_Y,
              vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
              vy: Math.sin(angle) * speed,
              r: 3 + Math.random() * 5,
            })
          }
        }
      }

      // Splat animation — mud particles fly, then game over
      const SPLAT_DURATION = 900
      if (chicken.isSplatted) {
        const splatElapsed = now - chicken.splatTime

        // Update mud particles
        for (const p of mudParticlesRef.current) {
          p.x += p.vx
          p.y += p.vy
          p.vy += 0.15 // gravity
          p.r *= 0.99 // shrink slightly
        }

        if (splatElapsed >= SPLAT_DURATION && !gameOverTriggeredRef.current) {
          gameOverTriggeredRef.current = true
          gameOverDelayRef.current = now
        }
      }

      // Game-over delay
      const GAME_OVER_DELAY = 300
      if (gameOverTriggeredRef.current) {
        const delayElapsed = now - gameOverDelayRef.current
        if (delayElapsed >= GAME_OVER_DELAY) {
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
      if (!gameOverTriggeredRef.current && (chicken.y > CANVAS_HEIGHT || (chicken.isJumping && chicken.x > platforms[platforms.length - 1].x + PLATFORM_WIDTH))) {
        gameOverTriggeredRef.current = true
        gameOverDelayRef.current = now
      }

      // Draw
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      ctx.save()

      // Sky gradient — shifts from morning blue to warm sunset as score increases
      const skyProgress = Math.min(score / 60, 1)
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
      const r1 = Math.round(135 + skyProgress * 80) // 87 → D7
      const g1 = Math.round(206 - skyProgress * 80) // CE → 7E
      const b1 = Math.round(235 - skyProgress * 60) // EB → AB
      gradient.addColorStop(0, `rgb(${r1},${g1},${b1})`)
      gradient.addColorStop(1, '#E0F6FF')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // Clouds (parallax 0.1x)
      const cloudOffsetX = cameraXRef.current * 0.1
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      const clouds = [
        { x: 100, y: 60, rx: 50, ry: 20 },
        { x: 400, y: 40, rx: 60, ry: 22 },
        { x: 700, y: 80, rx: 45, ry: 18 },
        { x: 1050, y: 50, rx: 55, ry: 20 },
      ]
      for (const cloud of clouds) {
        const cx = ((cloud.x - cloudOffsetX) % (CANVAS_WIDTH + 200) + CANVAS_WIDTH + 200) % (CANVAS_WIDTH + 200) - 100
        ctx.beginPath()
        ctx.ellipse(cx, cloud.y, cloud.rx, cloud.ry, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(cx - cloud.rx * 0.5, cloud.y + 5, cloud.rx * 0.6, cloud.ry * 0.8, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(cx + cloud.rx * 0.5, cloud.y + 3, cloud.rx * 0.5, cloud.ry * 0.7, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      // Mud Y — declared early so hills can extend down to it
      const MUD_Y = PLATFORM_Y + 65

      // Distant hills (parallax 0.2x) — extend down to mud
      const hillOffsetX = cameraXRef.current * 0.2
      ctx.fillStyle = '#90c695'
      ctx.beginPath()
      ctx.moveTo(0, MUD_Y)
      for (let hx = -50; hx <= CANVAS_WIDTH + 50; hx += 10) {
        const worldX = hx + hillOffsetX
        const hy = PLATFORM_Y - 40 - Math.sin(worldX * 0.008) * 30 - Math.sin(worldX * 0.003) * 20
        ctx.lineTo(hx, hy)
      }
      ctx.lineTo(CANVAS_WIDTH + 50, MUD_Y)
      ctx.closePath()
      ctx.fill()

      // Closer hills (parallax 0.35x) — extend down to mud
      const hill2OffsetX = cameraXRef.current * 0.35
      ctx.fillStyle = '#6dae72'
      ctx.beginPath()
      ctx.moveTo(0, MUD_Y)
      for (let hx = -50; hx <= CANVAS_WIDTH + 50; hx += 10) {
        const worldX = hx + hill2OffsetX
        const hy = PLATFORM_Y - 15 - Math.sin(worldX * 0.012 + 1) * 18 - Math.sin(worldX * 0.005) * 12
        ctx.lineTo(hx, hy)
      }
      ctx.lineTo(CANVAS_WIDTH + 50, MUD_Y)
      ctx.closePath()
      ctx.fill()

      // Mud ground — continuous across the whole scene
      const mudGrad = ctx.createLinearGradient(0, MUD_Y, 0, CANVAS_HEIGHT)
      mudGrad.addColorStop(0, '#6b4f2e')
      mudGrad.addColorStop(0.15, '#5a4025')
      mudGrad.addColorStop(0.5, '#4a331c')
      mudGrad.addColorStop(1, '#3a2814')
      ctx.fillStyle = mudGrad
      ctx.fillRect(0, MUD_Y, CANVAS_WIDTH, CANVAS_HEIGHT - MUD_Y)

      // Mud surface texture — subtle bumps and puddles
      const mudTexOffset = cameraXRef.current * 0.95
      ctx.fillStyle = 'rgba(0,0,0,0.08)'
      for (let mx = -20; mx < CANVAS_WIDTH + 20; mx += 35) {
        const worldMx = mx + mudTexOffset
        const bumpW = 15 + Math.sin(worldMx * 0.17) * 8
        ctx.beginPath()
        ctx.ellipse(mx, MUD_Y + 3, bumpW, 3, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      // Puddle highlights
      ctx.fillStyle = 'rgba(135,170,200,0.1)'
      for (let mx = 10; mx < CANVAS_WIDTH + 20; mx += 90) {
        const worldMx = mx + mudTexOffset
        const pw = 12 + Math.sin(worldMx * 0.11) * 6
        ctx.beginPath()
        ctx.ellipse(mx, MUD_Y + 5, pw, 2.5, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      // Mud top edge — soft uneven line
      ctx.fillStyle = '#7a5c35'
      ctx.beginPath()
      ctx.moveTo(0, MUD_Y + 2)
      for (let ex = 0; ex <= CANVAS_WIDTH; ex += 8) {
        const worldEx = ex + mudTexOffset
        ctx.lineTo(ex, MUD_Y - 1 + Math.sin(worldEx * 0.15) * 2)
      }
      ctx.lineTo(CANVAS_WIDTH, MUD_Y + 4)
      ctx.lineTo(0, MUD_Y + 4)
      ctx.closePath()
      ctx.fill()

      // Draw chicken coops as platforms
      // PLATFORM_Y is where the chicken's feet land (= roof peak)
      // The coop body extends downward from the roof eaves to the mud
      const COOP_W = PLATFORM_WIDTH
      const ROOF_H = 16           // Roof height from eaves to peak
      const ROOF_OVERHANG = 6
      const EAVES_Y = PLATFORM_Y + ROOF_H  // Where roof meets walls
      const COOP_BOTTOM = MUD_Y   // Walls sit on mud

      for (let i = 0; i < platforms.length; i++) {
        const platform = platforms[i]
        const screenX = platform.x - cameraXRef.current
        if (screenX < -COOP_W - ROOF_OVERHANG || screenX > CANVAS_WIDTH + ROOF_OVERHANG) continue

        // Shadow under coop
        ctx.fillStyle = 'rgba(0,0,0,0.2)'
        ctx.beginPath()
        ctx.ellipse(screenX + COOP_W / 2, COOP_BOTTOM + 2, COOP_W / 2 + 4, 4, 0, 0, Math.PI * 2)
        ctx.fill()

        // Coop body (wooden walls)
        ctx.fillStyle = '#c4913e'
        ctx.fillRect(screenX + 2, EAVES_Y, COOP_W - 4, COOP_BOTTOM - EAVES_Y)

        // Darker lower half
        ctx.fillStyle = '#a67a30'
        const lowerStart = EAVES_Y + (COOP_BOTTOM - EAVES_Y) * 0.55
        ctx.fillRect(screenX + 2, lowerStart, COOP_W - 4, COOP_BOTTOM - lowerStart)

        // Plank lines
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'
        ctx.lineWidth = 1
        const wallH = COOP_BOTTOM - EAVES_Y
        for (let p = 1; p <= 3; p++) {
          const py = EAVES_Y + (wallH * p) / 4
          ctx.beginPath()
          ctx.moveTo(screenX + 4, py)
          ctx.lineTo(screenX + COOP_W - 4, py)
          ctx.stroke()
        }

        // Door opening
        const doorW = 14
        const doorH = Math.min(18, wallH - 4)
        const doorX = screenX + COOP_W / 2 - doorW / 2
        const doorY = COOP_BOTTOM - doorH - 2
        ctx.fillStyle = '#2a1808'
        ctx.beginPath()
        ctx.moveTo(doorX, doorY + doorH)
        ctx.lineTo(doorX, doorY + 3)
        ctx.quadraticCurveTo(doorX, doorY, doorX + 3, doorY)
        ctx.lineTo(doorX + doorW - 3, doorY)
        ctx.quadraticCurveTo(doorX + doorW, doorY, doorX + doorW, doorY + 3)
        ctx.lineTo(doorX + doorW, doorY + doorH)
        ctx.fill()

        // Roof
        const roofLeft = screenX - ROOF_OVERHANG
        const roofRight = screenX + COOP_W + ROOF_OVERHANG
        const roofPeak = PLATFORM_Y // Chicken stands here

        // Roof shadow
        ctx.fillStyle = '#8b3535'
        ctx.beginPath()
        ctx.moveTo(roofLeft, EAVES_Y + 2)
        ctx.lineTo(screenX + COOP_W / 2, roofPeak + 2)
        ctx.lineTo(roofRight, EAVES_Y + 2)
        ctx.closePath()
        ctx.fill()

        // Roof body
        ctx.fillStyle = '#c04040'
        ctx.beginPath()
        ctx.moveTo(roofLeft, EAVES_Y)
        ctx.lineTo(screenX + COOP_W / 2, roofPeak)
        ctx.lineTo(roofRight, EAVES_Y)
        ctx.closePath()
        ctx.fill()

        // Roof left slope highlight
        ctx.fillStyle = '#d05050'
        ctx.beginPath()
        ctx.moveTo(roofLeft, EAVES_Y)
        ctx.lineTo(screenX + COOP_W / 2, roofPeak)
        ctx.lineTo(screenX + COOP_W / 2, EAVES_Y)
        ctx.closePath()
        ctx.fill()

        // Eaves line (bottom edge of roof)
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(roofLeft, EAVES_Y)
        ctx.lineTo(roofRight, EAVES_Y)
        ctx.stroke()
      }

      // Calculate chicken draw position with landing bounce
      const chickenScreenX = chicken.x - cameraXRef.current
      let chickenDrawY = chicken.y
      if (chicken.bounceTime > 0 && !chicken.isJumping && !chicken.isFalling && !chicken.isSplatted) {
        const bounceElapsed = now - chicken.bounceTime
        const BOUNCE_DURATION = 150
        if (bounceElapsed < BOUNCE_DURATION) {
          const bounceProgress = bounceElapsed / BOUNCE_DURATION
          chickenDrawY += Math.sin(bounceProgress * Math.PI) * 4
        }
      }

      if (chicken.isExploded) {
        // Draw cartoon explosion — poof cloud + feathers flying
        const boomX = chickenScreenX + CHICKEN_SIZE / 2
        const boomY = chickenDrawY + CHICKEN_SIZE / 2
        const boomElapsed = now - chicken.explodeTime
        const boomProgress = Math.min(boomElapsed / 300, 1)

        // Poof cloud (expands then fades)
        const cloudRadius = 20 + boomProgress * 30
        const cloudAlpha = Math.max(0, 1 - boomElapsed / 500)
        if (cloudAlpha > 0) {
          ctx.globalAlpha = cloudAlpha
          ctx.fillStyle = '#FFF8DC'
          ctx.beginPath()
          ctx.arc(boomX, boomY, cloudRadius, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#FFEEBB'
          ctx.beginPath()
          ctx.arc(boomX - 10, boomY - 8, cloudRadius * 0.7, 0, Math.PI * 2)
          ctx.fill()
          ctx.beginPath()
          ctx.arc(boomX + 12, boomY + 5, cloudRadius * 0.6, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
        }

        // Stars spinning outward
        if (boomElapsed < 600) {
          const starAlpha = Math.max(0, 1 - boomElapsed / 600)
          ctx.globalAlpha = starAlpha
          ctx.fillStyle = '#FFD166'
          for (let s = 0; s < 5; s++) {
            const sa = (s / 5) * Math.PI * 2 + boomElapsed * 0.005
            const sr = 25 + boomElapsed * 0.08
            const sx = boomX + Math.cos(sa) * sr
            const sy = boomY + Math.sin(sa) * sr
            ctx.font = 'bold 14px Arial'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText('\u2726', sx, sy)
          }
          ctx.globalAlpha = 1
        }

        // Feather particles (float and tumble)
        for (const fp of featherParticlesRef.current) {
          const featherAlpha = Math.max(0, 1 - boomElapsed / 900)
          ctx.globalAlpha = featherAlpha
          ctx.save()
          ctx.translate(fp.x - cameraXRef.current, fp.y)
          ctx.rotate(fp.rot)
          ctx.fillStyle = fp.color
          ctx.beginPath()
          ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = 'rgba(0,0,0,0.15)'
          ctx.lineWidth = 0.5
          ctx.beginPath()
          ctx.moveTo(-5, 0)
          ctx.lineTo(5, 0)
          ctx.stroke()
          ctx.restore()
        }
        ctx.globalAlpha = 1

      } else if (chicken.isSplatted) {
        // Draw mud splat and flattened chicken
        const splatX = chickenScreenX + CHICKEN_SIZE / 2
        const splatY = MUD_Y
        const splatElapsed = now - chicken.splatTime
        const splatProgress = Math.min(splatElapsed / 200, 1) // Squash over 200ms

        // Mud splash ring (expands outward)
        const ringRadius = 20 + splatProgress * 25
        ctx.fillStyle = '#5a4025'
        ctx.beginPath()
        ctx.ellipse(splatX, splatY, ringRadius, 6 + splatProgress * 3, 0, 0, Math.PI * 2)
        ctx.fill()

        // Inner darker mud
        ctx.fillStyle = '#4a331c'
        ctx.beginPath()
        ctx.ellipse(splatX, splatY, ringRadius * 0.6, 4, 0, 0, Math.PI * 2)
        ctx.fill()

        // Flattened chicken — squashed ellipse
        const squash = 1 - splatProgress * 0.6 // Height shrinks
        const stretch = 1 + splatProgress * 0.8 // Width grows
        ctx.fillStyle = '#FFD166'
        ctx.beginPath()
        ctx.ellipse(splatX, splatY - 8 * squash, 14 * stretch, 16 * squash, 0, 0, Math.PI * 2)
        ctx.fill()

        // Dizzy eyes (X X)
        if (splatProgress >= 0.5) {
          ctx.strokeStyle = '#1a1a2e'
          ctx.lineWidth = 2
          ctx.lineCap = 'round'
          // Left X
          const eyeY = splatY - 12 * squash
          ctx.beginPath()
          ctx.moveTo(splatX - 2, eyeY - 3)
          ctx.lineTo(splatX + 4, eyeY + 3)
          ctx.moveTo(splatX + 4, eyeY - 3)
          ctx.lineTo(splatX - 2, eyeY + 3)
          ctx.stroke()
          // Right X
          ctx.beginPath()
          ctx.moveTo(splatX + 8, eyeY - 3)
          ctx.lineTo(splatX + 14, eyeY + 3)
          ctx.moveTo(splatX + 14, eyeY - 3)
          ctx.lineTo(splatX + 8, eyeY + 3)
          ctx.stroke()
        }

        // Comb (tilted, sticking out)
        ctx.fillStyle = '#ef476f'
        ctx.beginPath()
        ctx.ellipse(splatX - 8 * stretch, splatY - 6 * squash, 5, 4 * squash, -0.3, 0, Math.PI * 2)
        ctx.fill()

        // Mud particles
        const mudColors = ['#6b4f2e', '#5a4025', '#4a331c', '#7a5c35']
        for (const p of mudParticlesRef.current) {
          const alpha = Math.max(0, 1 - splatElapsed / 800)
          ctx.fillStyle = mudColors[Math.floor(p.r) % mudColors.length]
          ctx.globalAlpha = alpha
          ctx.beginPath()
          ctx.arc(p.x - cameraXRef.current, p.y, Math.max(1, p.r), 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1

      } else {
        // Draw chicken normally (charming round style)
        const cx = chickenScreenX + CHICKEN_SIZE / 2
        const cy = chickenDrawY + CHICKEN_SIZE / 2

        ctx.save()

        // Wing (behind body)
        const wingAngle = chicken.isJumping
          ? Math.sin((now - chicken.jumpStartTime) / 60) * 0.4
          : chicken.isFalling ? Math.sin(now / 40) * 0.6 : 0 // Flap frantically when falling
        ctx.save()
        ctx.translate(cx - 6, cy + 2)
        ctx.rotate(wingAngle - 0.2)
        ctx.fillStyle = '#e6b800'
        ctx.beginPath()
        ctx.ellipse(0, 0, 10, 14, -0.3, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        // Body
        ctx.fillStyle = '#FFD166'
        ctx.beginPath()
        ctx.ellipse(cx, cy + 4, 16, 18, 0, 0, Math.PI * 2)
        ctx.fill()

        // Head
        ctx.fillStyle = '#FFD166'
        ctx.beginPath()
        ctx.arc(cx + 4, cy - 12, 12, 0, Math.PI * 2)
        ctx.fill()

        // Comb
        ctx.fillStyle = '#ef476f'
        ctx.beginPath()
        ctx.moveTo(cx, cy - 23)
        ctx.quadraticCurveTo(cx + 2, cy - 32, cx + 6, cy - 24)
        ctx.quadraticCurveTo(cx + 8, cy - 31, cx + 11, cy - 22)
        ctx.closePath()
        ctx.fill()

        // Eye
        ctx.fillStyle = '#1a1a2e'
        ctx.beginPath()
        ctx.arc(cx + 9, cy - 14, 3.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'white'
        ctx.beginPath()
        ctx.arc(cx + 10.5, cy - 15.5, 1.5, 0, Math.PI * 2)
        ctx.fill()

        // Beak
        ctx.fillStyle = '#ef8a3e'
        ctx.beginPath()
        ctx.moveTo(cx + 15, cy - 10)
        ctx.lineTo(cx + 24, cy - 7)
        ctx.lineTo(cx + 15, cy - 4)
        ctx.closePath()
        ctx.fill()

        // Legs
        ctx.strokeStyle = '#ef8a3e'
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(cx - 5, cy + 20)
        ctx.lineTo(cx - 7, cy + 28)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx - 11, cy + 28)
        ctx.lineTo(cx - 7, cy + 28)
        ctx.lineTo(cx - 3, cy + 26)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx + 5, cy + 20)
        ctx.lineTo(cx + 7, cy + 28)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx + 3, cy + 28)
        ctx.lineTo(cx + 7, cy + 28)
        ctx.lineTo(cx + 11, cy + 26)
        ctx.stroke()

        ctx.restore()
      }

      // Draw jump type feedback
      if (chicken.jumpDistance > 0 && now < jumpFeedbackTimerRef.current) {
        const jumpText = chicken.jumpDistance === 1 ? 'HOP 1' : chicken.jumpDistance === 2 ? 'HOP 2' : 'HOP 3'
        const jumpColor = chicken.jumpDistance === 1 ? '#06d6a0' : chicken.jumpDistance === 2 ? '#118ab2' : '#ef476f'

        ctx.save()
        ctx.fillStyle = jumpColor
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'
        ctx.lineWidth = 3
        ctx.font = 'bold 22px Fredoka, Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.strokeText(jumpText, chickenScreenX + CHICKEN_SIZE / 2, chickenDrawY - 25)
        ctx.fillText(jumpText, chickenScreenX + CHICKEN_SIZE / 2, chickenDrawY - 25)
        ctx.restore()
      }

      // In-canvas score HUD (top-right)
      ctx.save()
      const scoreText = `${score}`
      ctx.font = 'bold 28px Fredoka, Arial'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      const scoreWidth = ctx.measureText(scoreText).width
      // Pill background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      const pillX = CANVAS_WIDTH - 18 - scoreWidth - 16
      ctx.beginPath()
      ctx.roundRect(pillX, 12, scoreWidth + 32, 38, 19)
      ctx.fill()
      // Score text
      ctx.fillStyle = '#FFD166'
      ctx.fillText(scoreText, CANVAS_WIDTH - 22, 17)
      ctx.restore()

      // Volume indicator (matched to onboarding colors)
      const level1Active = volume > t1
      const level2Active = volume > t2
      const level3Active = volume > t3

      const barWidth = 30
      const barHeight = 16
      const barSpacing = 4
      const startX = 12
      const startY = CANVAS_HEIGHT - 65

      // Level 1 (bottom) - Teal
      ctx.fillStyle = level1Active ? '#06d6a0' : 'rgba(0,0,0,0.25)'
      ctx.beginPath()
      ctx.roundRect(startX, startY, barWidth, barHeight, 3)
      ctx.fill()
      // Level 2 (middle) - Blue
      ctx.fillStyle = level2Active ? '#118ab2' : 'rgba(0,0,0,0.25)'
      ctx.beginPath()
      ctx.roundRect(startX, startY - barHeight - barSpacing, barWidth, barHeight, 3)
      ctx.fill()
      // Level 3 (top) - Coral
      ctx.fillStyle = level3Active ? '#ef476f' : 'rgba(0,0,0,0.25)'
      ctx.beginPath()
      ctx.roundRect(startX, startY - (barHeight + barSpacing) * 2, barWidth, barHeight, 3)
      ctx.fill()

      // Labels inside bars
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.font = 'bold 11px Fredoka, Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('1', startX + barWidth / 2, startY + barHeight / 2)
      ctx.fillText('2', startX + barWidth / 2, startY - barHeight / 2 - barSpacing)
      ctx.fillText('3', startX + barWidth / 2, startY - barHeight * 1.5 - barSpacing * 2)

      // End screen shake transform
      ctx.restore()

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
        <a href="/vibe-games/" className="back-button">← Back to Games</a>
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

            <div className="hop-diagram">
              <div className="hop-level">
                <span className="hop-volume hop-quiet">Quiet</span>
                <span className="hop-arrow">→</span>
                <span className="hop-distance">Hop 1</span>
              </div>
              <div className="hop-level">
                <span className="hop-volume hop-medium">Medium</span>
                <span className="hop-arrow">→</span>
                <span className="hop-distance">Hop 2</span>
              </div>
              <div className="hop-level">
                <span className="hop-volume hop-loud">Loud</span>
                <span className="hop-arrow">→</span>
                <span className="hop-distance">Hop 3</span>
              </div>
            </div>

            {micPermission === 'granted' && (
              <div className="sensitivity-controls">
                <p className="try-it-prompt">Try clucking to test your mic</p>
                <div className="volume-meter">
                  {(() => {
                    const { t1, t2, t3, tBoom } = getThresholds()
                    const maxDisplay = tBoom * 1.3
                    const pct1 = Math.min((t1 / maxDisplay) * 100, 100)
                    const pct2 = Math.min((t2 / maxDisplay) * 100, 100)
                    const pct3 = Math.min((t3 / maxDisplay) * 100, 100)
                    const pctBoom = Math.min((tBoom / maxDisplay) * 100, 100)
                    return (
                      <>
                        <div className="meter-zones">
                          <div className="meter-zone zone-1" ref={el => { zoneRefs.current[0] = el }} style={{ left: `${pct1}%`, width: `${pct2 - pct1}%` }} />
                          <div className="meter-zone zone-2" ref={el => { zoneRefs.current[1] = el }} style={{ left: `${pct2}%`, width: `${pct3 - pct2}%` }} />
                          <div className="meter-zone zone-3" ref={el => { zoneRefs.current[2] = el }} style={{ left: `${pct3}%`, width: `${pctBoom - pct3}%` }} />
                          <div className="meter-zone zone-boom" ref={el => { zoneRefs.current[3] = el }} style={{ left: `${pctBoom}%`, width: `${100 - pctBoom}%` }} />
                        </div>
                        <div className="meter-labels">
                          <span style={{ left: `${(pct1 + pct2) / 2}%` }}>1</span>
                          <span style={{ left: `${(pct2 + pct3) / 2}%` }}>2</span>
                          <span style={{ left: `${(pct3 + pctBoom) / 2}%` }}>3</span>
                          <span style={{ left: `${(pctBoom + 100) / 2}%` }}>💥</span>
                        </div>
                        <div className="meter-fill" ref={fillRef} />
                        <div className="meter-needle" ref={needleRef} />
                        <div className="meter-hop-label" ref={previewHopRef} />
                      </>
                    )
                  })()}
                </div>
                <div className="sensitivity-slider-row">
                  <span className="sensitivity-end">Low</span>
                  <input
                    type="range"
                    min="0.3"
                    max="3"
                    step="0.1"
                    value={sensitivity}
                    onChange={e => handleSensitivityChange(parseFloat(e.target.value))}
                    className="sensitivity-slider"
                  />
                  <span className="sensitivity-end">High</span>
                </div>
              </div>
            )}
            {micPermission === 'pending' && (
              <p className="mic-pending">Waiting for microphone access...</p>
            )}
            {micPermission === 'denied' && (
              <p className="error">Microphone access is needed to play. Please enable it in your browser settings.</p>
            )}
            <button onClick={startGame} className="start-button" disabled={micPermission === 'denied'}>
              Start Game
            </button>
          </div>
        )}

        {gameOver && (
          <div className="game-overlay">
            <h2>Game Over!</h2>
            <p>Score: {score}</p>
            {score > highScore && <p className="new-high-score">New High Score! 🎉</p>}
            <div className="sensitivity-controls">
              <label className="sensitivity-label">Mic Sensitivity</label>
              <div className="sensitivity-slider-row">
                <span className="sensitivity-end">Low</span>
                <input
                  type="range"
                  min="0.3"
                  max="3"
                  step="0.1"
                  value={sensitivity}
                  onChange={e => handleSensitivityChange(parseFloat(e.target.value))}
                  className="sensitivity-slider"
                />
                <span className="sensitivity-end">High</span>
              </div>
            </div>
            <button onClick={restartGame} className="start-button">
              Play Again
            </button>
          </div>
        )}
      </div>

    </div>
  )
}

export default ChickenHop
