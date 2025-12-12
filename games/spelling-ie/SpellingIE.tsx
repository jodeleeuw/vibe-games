import { useEffect, useRef, useState } from 'react'
import './SpellingIE.css'

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
  isCorrect: boolean
  displayText: string
}

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600
const WORD_WIDTH = 150
const WORD_HEIGHT = 60
const INITIAL_LIVES = 5
const INITIAL_FALL_SPEED = 1
const MAX_FALL_SPEED = 3
const SPEED_INCREMENT = 0.1

// Word pairs with i/e variations
const WORD_PAIRS = [
  { correct: 'kick', incorrect: 'keck' },
  { correct: 'lick', incorrect: 'leck' },
  { correct: 'pick', incorrect: 'peck' },
  { correct: 'stick', incorrect: 'steck' },
  { correct: 'thick', incorrect: 'theck' },
  { correct: 'click', incorrect: 'cleck' },
  { correct: 'trick', incorrect: 'treck' },
  { correct: 'brick', incorrect: 'breck' },
  { correct: 'quick', incorrect: 'queck' },
  { correct: 'chick', incorrect: 'check' },
  { correct: 'sick', incorrect: 'seck' },
  { correct: 'wick', incorrect: 'weck' },
  { correct: 'slick', incorrect: 'sleck' },
  { correct: 'flick', incorrect: 'fleck' },
  { correct: 'prick', incorrect: 'preck' },
]

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
    const isCorrectLeft = Math.random() < 0.5
    
    const wordId = wordIdCounterRef.current++
    const word: Word = {
      correct: wordPair.correct,
      incorrect: wordPair.incorrect,
      id: wordId
    }

    // Speak the correct word
    speakWord(word.correct)

    // Create two falling words - one correct, one incorrect
    const leftX = CANVAS_WIDTH / 3 - WORD_WIDTH / 2
    const rightX = (CANVAS_WIDTH * 2) / 3 - WORD_WIDTH / 2

    const leftWord: FallingWord = {
      word,
      x: leftX,
      y: -WORD_HEIGHT,
      speed: currentSpeed,
      isCorrect: isCorrectLeft,
      displayText: isCorrectLeft ? word.correct : word.incorrect
    }

    const rightWord: FallingWord = {
      word,
      x: rightX,
      y: -WORD_HEIGHT,
      speed: currentSpeed,
      isCorrect: !isCorrectLeft,
      displayText: !isCorrectLeft ? word.correct : word.incorrect
    }

    fallingWordsRef.current.push(leftWord, rightWord)
  }

  const handleWordClick = (clickedWord: FallingWord) => {
    if (!isPlaying) return

    // Find the pair (both words with same id)
    const wordPair = fallingWordsRef.current.filter(w => w.word.id === clickedWord.word.id)
    
    if (clickedWord.isCorrect) {
      // Correct word clicked - remove both words and increment score
      fallingWordsRef.current = fallingWordsRef.current.filter(w => w.word.id !== clickedWord.word.id)
      setScore(prev => prev + 1)
      
      // Increase speed gradually
      setCurrentSpeed(prev => Math.min(prev + SPEED_INCREMENT, MAX_FALL_SPEED))
      
      // Play success sound
      playSuccessSound()
    } else {
      // Wrong word clicked - make correct word fall faster (accelerate)
      const correctWord = wordPair.find(w => w.isCorrect)
      if (correctWord) {
        correctWord.speed = currentSpeed * 3 // Fall 3x faster
      }
      
      // Remove the incorrect word
      fallingWordsRef.current = fallingWordsRef.current.filter(w => w !== clickedWord)
      
      // Play error sound
      playErrorSound()
    }
  }

  const playSuccessSound = () => {
    const audioContext = new AudioContext()
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
    const audioContext = new AudioContext()
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
        if (
          x >= word.x &&
          x <= word.x + WORD_WIDTH &&
          y >= word.y &&
          y <= word.y + WORD_HEIGHT
        ) {
          handleWordClick(word)
          break
        }
      }
    }

    canvas.addEventListener('click', handleCanvasClick)

    const gameLoop = () => {
      const now = Date.now()

      // Spawn new word pair at intervals
      if (now - lastSpawnTimeRef.current > spawnIntervalRef.current) {
        createNewWord()
        lastSpawnTimeRef.current = now
        
        // Gradually decrease spawn interval (make it harder)
        spawnIntervalRef.current = Math.max(1500, spawnIntervalRef.current - 50)
      }

      // Update word positions
      const wordsToRemove: FallingWord[] = []
      for (const word of fallingWordsRef.current) {
        word.y += word.speed
        
        // Check if word hit the ground
        if (word.y >= CANVAS_HEIGHT) {
          wordsToRemove.push(word)
          
          // Only lose a life if the correct word hits the ground
          if (word.isCorrect) {
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
        const wordId = word.word.id
        fallingWordsRef.current = fallingWordsRef.current.filter(w => w.word.id !== wordId)
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
        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
        ctx.fillRect(word.x + 3, word.y + 3, WORD_WIDTH, WORD_HEIGHT)

        // Word box
        ctx.fillStyle = word.isCorrect ? '#90EE90' : '#FFB6C1'
        ctx.fillRect(word.x, word.y, WORD_WIDTH, WORD_HEIGHT)

        // Border
        ctx.strokeStyle = '#333'
        ctx.lineWidth = 3
        ctx.strokeRect(word.x, word.y, WORD_WIDTH, WORD_HEIGHT)

        // Text
        ctx.fillStyle = '#000'
        ctx.font = 'bold 24px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(word.displayText, word.x + WORD_WIDTH / 2, word.y + WORD_HEIGHT / 2)
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
              <li>Words with 'i' or 'e' will fall from the top</li>
              <li>Listen carefully to the word spoken</li>
              <li>Click the correct spelling before it hits the ground</li>
              <li>If you click wrong, the correct word falls faster!</li>
              <li>Don't let correct words hit the ground - you'll lose a life!</li>
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
          Listen to the word spoken out loud, then click the correct spelling!
          Words use either 'i' or 'e' - choose wisely. If you make a mistake,
          the correct word will fall faster. Keep the correct words from hitting
          the ground to preserve your lives!
        </p>
      </div>
    </div>
  )
}

export default SpellingIE
