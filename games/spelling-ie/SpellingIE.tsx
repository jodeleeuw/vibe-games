import { useEffect, useRef, useState } from 'react'
import './SpellingIE.css'
import { WORD_PAIRS } from './wordPairs'

interface Word {
  correct: string
  incorrect: string
  id: number
}

interface FallingWord {
  word: Word
  x: number
  y: number
  speed: number
  correctOnLeft: boolean // Which side has the correct spelling
  clickedSide: 'left' | 'right' | null // Which side was clicked
  clickedCorrectly: boolean | null // Whether the click was correct
}

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600
const WORD_WIDTH = 150
const WORD_HEIGHT = 60
const INITIAL_LIVES = 5
const INITIAL_FALL_SPEED = 1
const MAX_FALL_SPEED = 3
const SPEED_INCREMENT = 0.1

function SpellingIE() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(INITIAL_LIVES)
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('spellingIEHighScore')
    return saved ? parseInt(saved) : 0
  })
  const [gameOver, setGameOver] = useState(false)
  const [currentSpeed, setCurrentSpeed] = useState(INITIAL_FALL_SPEED)

  const fallingWordsRef = useRef<FallingWord[]>([])
  const animationRef = useRef<number>()
  const lastSpawnTimeRef = useRef(0)
  const spawnIntervalRef = useRef(2500) // Start with 2.5 seconds between words
  const wordIdCounterRef = useRef(0)
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  const speakWord = (word: string) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel()
      
      const utterance = new SpeechSynthesisUtterance(word)
      utterance.rate = 0.8 // Slightly slower for clarity
      utterance.pitch = 1
      utterance.volume = 1
      
      speechSynthesisRef.current = utterance
      window.speechSynthesis.speak(utterance)
    }
  }

  const createNewWord = () => {
    const wordPair = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)]
    const correctOnLeft = Math.random() < 0.5
    
    const wordId = wordIdCounterRef.current++
    const word: Word = {
      correct: wordPair.correct,
      incorrect: wordPair.incorrect,
      id: wordId
    }

    // Speak the correct word
    speakWord(word.correct)

    // Create one falling word showing both spellings
    const centerX = CANVAS_WIDTH / 2 - WORD_WIDTH

    const fallingWord: FallingWord = {
      word,
      x: centerX,
      y: -WORD_HEIGHT,
      speed: currentSpeed,
      correctOnLeft,
      clickedSide: null,
      clickedCorrectly: null
    }

    fallingWordsRef.current.push(fallingWord)
  }

  const handleWordClick = (clickedWord: FallingWord, side: 'left' | 'right') => {
    if (!isPlaying || clickedWord.clickedSide !== null) return // Already clicked

    const isCorrect = (side === 'left' && clickedWord.correctOnLeft) || 
                     (side === 'right' && !clickedWord.correctOnLeft)
    
    clickedWord.clickedSide = side
    clickedWord.clickedCorrectly = isCorrect
    
    if (isCorrect) {
      // Correct word clicked - increment score and remove after brief delay
      setScore(prev => prev + 1)
      
      // Increase speed gradually
      setCurrentSpeed(prev => Math.min(prev + SPEED_INCREMENT, MAX_FALL_SPEED))
      
      // Play success sound
      playSuccessSound()
      
      // Remove the word after a brief delay to show feedback
      setTimeout(() => {
        fallingWordsRef.current = fallingWordsRef.current.filter(w => w !== clickedWord)
      }, 300)
    } else {
      // Wrong word clicked - make it fall faster
      clickedWord.speed = currentSpeed * 3
      
      // Play error sound
      playErrorSound()
    }
  }

  const playSuccessSound = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    const audioContext = audioContextRef.current
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = 587 // D5
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.2)
  }

  const playErrorSound = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    const audioContext = audioContextRef.current
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = 196 // G3
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.3)
  }

  const initGame = () => {
    fallingWordsRef.current = []
    lastSpawnTimeRef.current = Date.now()
    spawnIntervalRef.current = 2500
    wordIdCounterRef.current = 0
    setScore(0)
    setLives(INITIAL_LIVES)
    setGameOver(false)
    setIsPlaying(true)
    setCurrentSpeed(INITIAL_FALL_SPEED)
  }

  const startGame = () => {
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

    const handleCanvasClick = (event: MouseEvent) => {
      if (!isPlaying) return

      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top

      // Check if click is on any falling word
      for (const word of fallingWordsRef.current) {
        // Each word now shows two spellings side by side
        const leftHalfX = word.x
        const rightHalfX = word.x + WORD_WIDTH
        const totalWidth = WORD_WIDTH * 2
        
        if (
          x >= leftHalfX &&
          x <= leftHalfX + totalWidth &&
          y >= word.y &&
          y <= word.y + WORD_HEIGHT
        ) {
          // Determine which side was clicked
          const side = x < rightHalfX ? 'left' : 'right'
          handleWordClick(word, side)
          break
        }
      }
    }

    canvas.addEventListener('click', handleCanvasClick)

    const gameLoop = () => {
      const now = Date.now()

      // Spawn new word only if no words are currently falling
      if (fallingWordsRef.current.length === 0 && now - lastSpawnTimeRef.current > 500) {
        createNewWord()
        lastSpawnTimeRef.current = now
      }

      // Update word positions
      const wordsToRemove: FallingWord[] = []
      for (const word of fallingWordsRef.current) {
        word.y += word.speed
        
        // Check if word hit the ground
        if (word.y >= CANVAS_HEIGHT) {
          wordsToRemove.push(word)
          
          // Lose a life if word wasn't clicked correctly or at all
          if (word.clickedCorrectly !== true) {
            setLives(prev => {
              const newLives = prev - 1
              if (newLives <= 0) {
                setGameOver(true)
                setIsPlaying(false)
                if (score > highScore) {
                  setHighScore(score)
                  localStorage.setItem('spellingIEHighScore', score.toString())
                }
              }
              return newLives
            })
          }
        }
      }

      // Remove words that hit the ground
      for (const word of wordsToRemove) {
        fallingWordsRef.current = fallingWordsRef.current.filter(w => w !== word)
      }

      // Draw
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // Draw gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
      gradient.addColorStop(0, '#E8F4F8')
      gradient.addColorStop(1, '#B8E0F0')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // Draw ground line
      ctx.strokeStyle = '#8B4513'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(0, CANVAS_HEIGHT - 2)
      ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - 2)
      ctx.stroke()

      // Draw falling words
      for (const word of fallingWordsRef.current) {
        const totalWidth = WORD_WIDTH * 2
        const leftText = word.correctOnLeft ? word.word.correct : word.word.incorrect
        const rightText = word.correctOnLeft ? word.word.incorrect : word.word.correct
        
        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
        ctx.fillRect(word.x + 3, word.y + 3, totalWidth, WORD_HEIGHT)

        // Determine colors based on click state
        let leftColor = '#E8E8E8' // Neutral gray
        let rightColor = '#E8E8E8' // Neutral gray
        
        if (word.clickedSide === 'left') {
          leftColor = word.clickedCorrectly ? '#90EE90' : '#FFB6C1'
        } else if (word.clickedSide === 'right') {
          rightColor = word.clickedCorrectly ? '#90EE90' : '#FFB6C1'
        }

        // Left box
        ctx.fillStyle = leftColor
        ctx.fillRect(word.x, word.y, WORD_WIDTH, WORD_HEIGHT)
        ctx.strokeStyle = '#333'
        ctx.lineWidth = 3
        ctx.strokeRect(word.x, word.y, WORD_WIDTH, WORD_HEIGHT)

        // Right box
        ctx.fillStyle = rightColor
        ctx.fillRect(word.x + WORD_WIDTH, word.y, WORD_WIDTH, WORD_HEIGHT)
        ctx.strokeRect(word.x + WORD_WIDTH, word.y, WORD_WIDTH, WORD_HEIGHT)

        // Text for both sides
        ctx.fillStyle = '#000'
        ctx.font = 'bold 24px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(leftText, word.x + WORD_WIDTH / 2, word.y + WORD_HEIGHT / 2)
        ctx.fillText(rightText, word.x + WORD_WIDTH + WORD_WIDTH / 2, word.y + WORD_HEIGHT / 2)
      }

      // Draw score and lives
      ctx.fillStyle = '#000'
      ctx.font = 'bold 20px Arial'
      ctx.textAlign = 'left'
      ctx.fillText(`Score: ${score}`, 20, 30)
      
      // Draw hearts for lives
      ctx.textAlign = 'right'
      const heartsText = '❤️'.repeat(lives)
      ctx.fillText(`Lives: ${heartsText}`, CANVAS_WIDTH - 20, 30)

      animationRef.current = requestAnimationFrame(gameLoop)
    }

    gameLoop()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      canvas.removeEventListener('click', handleCanvasClick)
    }
  }, [isPlaying, score, lives, highScore, currentSpeed])

  useEffect(() => {
    return () => {
      // Cancel any ongoing speech when component unmounts
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      // Close AudioContext when component unmounts
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  return (
    <div className="spelling-ie">
      <div className="game-header">
        <a href="/" className="back-button">← Back to Games</a>
        <h1>📝 Spelling i/e</h1>
        <div className="scores">
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
            <h2>Spelling Challenge!</h2>
            <p>Listen to the word and click the correct spelling</p>
            <ul>
              <li>One word box showing both spellings will fall from the top</li>
              <li>Listen carefully to the word spoken</li>
              <li>Click on the correct spelling before the box hits the ground</li>
              <li>If you click wrong, the word falls faster!</li>
              <li>Don't let words hit the ground without clicking correctly - you'll lose a life!</li>
            </ul>
            <button onClick={startGame} className="start-button">
              Start Game
            </button>
          </div>
        )}

        {gameOver && (
          <div className="game-overlay">
            <h2>Game Over!</h2>
            <p>Final Score: {score}</p>
            {score > highScore && <p className="new-high-score">New High Score! 🎉</p>}
            <button onClick={restartGame} className="start-button">
              Play Again
            </button>
          </div>
        )}
      </div>

      <div className="instructions">
        <h3>How to Play</h3>
        <p>
          Listen to the word spoken out loud, then click on the correct spelling!
          Each falling box shows two spellings with 'i' or 'e' - choose wisely. 
          If you make a mistake, the word falls faster. Click correctly before 
          words hit the ground to preserve your lives!
        </p>
      </div>
    </div>
  )
}

export default SpellingIE
