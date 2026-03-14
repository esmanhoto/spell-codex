import { useEffect, useRef, useState } from "react"
import s from "./GameLoadingScreen.module.css"

const RUNE_CHARS = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ"

const LOADING_STEPS = [
  "Loading game state…",
  "Shuffling decks…",
  "Preparing realms…",
  "Summoning champions…",
  "Entering the arena…",
]

const CIRCLE_SIZES = [500, 360, 220] as const
const RUNE_COUNTS = [8, 12, 16] as const
const CIRCLE_CLASSES = [s.circle0, s.circle1, s.circle2] as const

// Stable random data generated once per mount
function useStableRandom<T>(factory: () => T): T {
  const ref = useRef<T | null>(null)
  if (ref.current === null) ref.current = factory()
  return ref.current
}

function RunicCircles() {
  return (
    <div className={s.circlesWrap}>
      {CIRCLE_SIZES.map((size, i) => {
        const count = RUNE_COUNTS[i]!
        return (
          <div key={i} className={CIRCLE_CLASSES[i]}>
            {Array.from({ length: count }, (_, j) => {
              const angle = (j / count) * 360
              const rad = (angle * Math.PI) / 180
              const r = size / 2 - 8
              const x = Math.cos(rad) * r
              const y = Math.sin(rad) * r
              return (
                <span
                  key={j}
                  className={s.rune}
                  style={{
                    left: "50%",
                    top: "50%",
                    fontSize: `${10 + i * 2}px`,
                    transform: `translate(-50%,-50%) translate(${x}px,${y}px) rotate(${angle + 90}deg)`,
                    animationDuration: `${2 + (j % 4) * 0.5}s`,
                    animationDelay: `${j * 0.15}s`,
                  }}
                >
                  {RUNE_CHARS[(j + i * 7) % RUNE_CHARS.length]}
                </span>
              )
            })}
          </div>
        )
      })}
      <div className={s.centerGlow} />
    </div>
  )
}

interface FloatingRune {
  left: string
  top: string
  fontSize: string
  char: string
  duration: string
  delay: string
}

function FloatingRunes() {
  const runes = useStableRandom<FloatingRune[]>(() =>
    Array.from({ length: 15 }, (_, i) => ({
      left: `${10 + ((i * 37 + 13) % 80)}%`,
      top: `${10 + ((i * 53 + 7) % 80)}%`,
      fontSize: `${20 + (i % 3) * 15}px`,
      char: RUNE_CHARS[(i * 3) % RUNE_CHARS.length]!,
      duration: `${4 + (i % 4)}s`,
      delay: `${(i % 3)}s`,
    })),
  )

  return (
    <>
      {runes.map((r, i) => (
        <span
          key={i}
          className={s.floatingRune}
          style={{
            left: r.left,
            top: r.top,
            fontSize: r.fontSize,
            animationDuration: r.duration,
            animationDelay: r.delay,
          }}
        >
          {r.char}
        </span>
      ))}
    </>
  )
}

interface Props {
  /** 0–100; if omitted a fake progress runs automatically */
  progress?: number | undefined
}

export function GameLoadingScreen({ progress: externalProgress }: Props) {
  const [progress, setProgress] = useState(externalProgress ?? 0)
  const stepIndex = Math.min(
    Math.floor((progress / 100) * LOADING_STEPS.length),
    LOADING_STEPS.length - 1,
  )

  useEffect(() => {
    if (externalProgress !== undefined) {
      setProgress(externalProgress)
      return
    }
    const id = setInterval(() => {
      setProgress((p) => (p >= 100 ? 100 : p + 0.5))
    }, 50)
    return () => clearInterval(id)
  }, [externalProgress])

  return (
    <div className={s.screen}>
      <RunicCircles />
      <FloatingRunes />

      <div className={s.content}>
        <h1 className={s.title}>Codex Spellfire</h1>

        <div className={s.progressWrap}>
          <div className={s.track}>
            <div className={s.fill} style={{ width: `${progress}%` }} />
            <div className={s.shimmer} />
          </div>
          <div className={s.meta}>
            <span key={stepIndex} className={s.step}>
              {LOADING_STEPS[stepIndex]}
            </span>
            <span className={s.pct}>{Math.round(progress)}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
