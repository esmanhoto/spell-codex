import { useState, useRef, useEffect, useCallback } from "react"
import { Play, Pause, Music, Volume2, Volume1, VolumeX } from "lucide-react"
import styles from "./MusicPlayer.module.css"

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

interface YTPlayerOptions {
  width: number
  height: number
  playerVars: {
    autoplay: 0 | 1
    controls: 0 | 1
    disablekb: 0 | 1
    fs: 0 | 1
    modestbranding: 1
    playsinline: 1
  }
  events: {
    onReady: () => void
  }
}

interface YTPlayer {
  loadPlaylist(opts: { list: string; listType: string; index: number }): void
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  setVolume(volume: number): void
  destroy(): void
}

const PLAYLISTS = [
  { id: "heavy-metal" as const, label: "Heavy Metal", playlistId: "PLidIjcybOMhxU8YWXMgZnH7a2jJZoyBGD" },
  { id: "power-metal" as const, label: "Power Metal", playlistId: "PLyNluqYn9ZuiK_HyJeUa1hSOT0t4oIbC0" },
]

type PlaylistId = "heavy-metal" | "power-metal"

const DEFAULT_VOLUME = 70

function VolumeIcon({ volume, className }: { volume: number; className?: string }) {
  if (volume === 0) return <VolumeX className={className} />
  if (volume < 75) return <Volume1 className={className} />
  return <Volume2 className={className} />
}

export function MusicPlayer() {
  const [activeId, setActiveId] = useState<PlaylistId | null>(null)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(DEFAULT_VOLUME)
  const [open, setOpen] = useState(false)
  const [apiReady, setApiReady] = useState(false)
  const playerRef = useRef<YTPlayer | null>(null)
  const ytWrapperRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const volumeRef = useRef(DEFAULT_VOLUME)

  const createPlayer = useCallback((playlistId: string) => {
    if (!ytWrapperRef.current || !window.YT?.Player) return

    playerRef.current?.destroy()
    playerRef.current = null

    const inner = document.createElement("div")
    ytWrapperRef.current.innerHTML = ""
    ytWrapperRef.current.appendChild(inner)

    playerRef.current = new window.YT.Player(inner, {
      width: 1,
      height: 1,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          playerRef.current?.setVolume(volumeRef.current)
          playerRef.current?.loadPlaylist({ list: playlistId, listType: "playlist", index: 0 })
          playerRef.current?.playVideo()
          setPlaying(true)
        },
      },
    })
  }, [])

  useEffect(() => {
    const wrapper = document.createElement("div")
    wrapper.style.cssText =
      "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;left:-9999px"
    document.body.appendChild(wrapper)
    ytWrapperRef.current = wrapper

    function onApiReady() {
      setApiReady(true)
    }

    if (window.YT?.Player) {
      onApiReady()
    } else {
      window.onYouTubeIframeAPIReady = onApiReady
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const script = document.createElement("script")
        script.src = "https://www.youtube.com/iframe_api"
        document.head.appendChild(script)
      }
    }

    return () => {
      playerRef.current?.destroy()
      playerRef.current = null
      wrapper.remove()
      ytWrapperRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [open])

  const selectPlaylist = useCallback(
    (id: PlaylistId) => {
      if (!apiReady) return
      setOpen(false)
      const playlist = PLAYLISTS.find((p) => p.id === id)
      if (!playlist) return
      setActiveId(id)
      createPlayer(playlist.playlistId)
    },
    [apiReady, createPlayer],
  )

  const clearMusic = useCallback(() => {
    setOpen(false)
    playerRef.current?.stopVideo()
    playerRef.current?.destroy()
    playerRef.current = null
    if (ytWrapperRef.current) ytWrapperRef.current.innerHTML = ""
    setActiveId(null)
    setPlaying(false)
  }, [])

  const togglePlayPause = useCallback(() => {
    if (!playerRef.current) return
    if (playing) {
      playerRef.current.pauseVideo()
      setPlaying(false)
    } else {
      playerRef.current.playVideo()
      setPlaying(true)
    }
  }, [playing])

  const onVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value)
    volumeRef.current = v
    setVolume(v)
    playerRef.current?.setVolume(v)
  }, [])

  const active = PLAYLISTS.find((p) => p.id === activeId)

  return (
    <div className={styles.wrapper} ref={containerRef}>
      <div className={`${styles.pill} ${open ? styles.pillOpen : ""}`}>
        {activeId && (
          <button
            type="button"
            className={styles.pillBtn}
            onClick={togglePlayPause}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className={styles.icon} /> : <Play className={styles.icon} />}
          </button>
        )}
        <button
          type="button"
          className={styles.pillLabel}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <Music className={styles.icon} />
          <span>{active?.label ?? "Choose Music"}</span>
          <span className={styles.caret}>▾</span>
        </button>
        {activeId && (
          <div className={styles.volumeWrapper}>
            <div className={styles.volumeIcon}>
              <VolumeIcon volume={volume} className={styles.icon} />
            </div>
            <div className={styles.volumePopup}>
              <input
                type="range"
                className={styles.volumeSlider}
                min={0}
                max={100}
                value={volume}
                onChange={onVolumeChange}
                aria-label="Volume"
              />
            </div>
          </div>
        )}
      </div>

      {open && (
        <div className={styles.dropdown}>
          <button type="button" className={`${styles.option} ${styles.optionStop}`} onClick={clearMusic}>
            <span className={styles.optionStopIcon}>✕</span>
            <span>No Music</span>
          </button>
          {PLAYLISTS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`${styles.option} ${p.id === activeId ? styles.optionActive : ""}`}
              onClick={() => selectPlaylist(p.id)}
            >
              <Music className={styles.optionIcon} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
