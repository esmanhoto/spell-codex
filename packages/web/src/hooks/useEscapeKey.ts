import { useEffect } from "react"

/** Calls `handler` when the Escape key is pressed. */
export function useEscapeKey(handler: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handler()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [handler])
}
