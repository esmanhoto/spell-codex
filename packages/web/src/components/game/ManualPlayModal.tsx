import { useEffect, useMemo, useState } from "react"
import type { CardInfo, ManualPlayResolution, ManualPlayTargetKind } from "../../api.ts"
import styles from "./ManualPlayModal.module.css"

export interface ManualPlayTargetOption {
  cardInstanceId: string
  label: string
  owner: "self" | "opponent"
}

export function ManualPlayModal({
  card,
  targets,
  onPick,
  onClose,
}: {
  card: CardInfo
  targets: ManualPlayTargetOption[]
  onPick: (selection: {
    targetKind: ManualPlayTargetKind
    resolution: ManualPlayResolution
    targetOwner?: "self" | "opponent"
    targetCardInstanceId?: string
  }) => void
  onClose: () => void
}) {
  const [targetKind, setTargetKind] = useState<ManualPlayTargetKind>("none")
  const [resolution, setResolution] = useState<ManualPlayResolution>("discard")
  const [targetOwner, setTargetOwner] = useState<"self" | "opponent">("self")
  const ownerTargets = useMemo(
    () => targets.filter(t => t.owner === targetOwner),
    [targetOwner, targets],
  )
  const [targetCardId, setTargetCardId] = useState<string>("")

  useEffect(() => {
    if (ownerTargets.length === 0) {
      setTargetCardId("")
      return
    }
    if (!ownerTargets.some(t => t.cardInstanceId === targetCardId)) {
      setTargetCardId(ownerTargets[0]!.cardInstanceId)
    }
  }, [ownerTargets, targetCardId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const isCardTargetRequired = targetKind === "card" || resolution === "lasting_target"
  const canSubmit = !isCardTargetRequired || targetCardId.length > 0

  return (
    <div className={styles.backdrop} data-testid="manual-play-modal" onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.title}>Play/Cast</div>
        <div className={styles.message}>Choose how to resolve <strong>{card.name}</strong>.</div>

        <label className={styles.row}>
          <span>Target</span>
          <select
            data-testid="manual-play-target-kind"
            value={targetKind}
            onChange={e => setTargetKind(e.target.value as ManualPlayTargetKind)}
          >
            <option value="none">None</option>
            <option value="player">Player</option>
            <option value="card">Card</option>
          </select>
        </label>

        <label className={styles.row}>
          <span>Resolution</span>
          <select
            data-testid="manual-play-resolution"
            value={resolution}
            onChange={e => setResolution(e.target.value as ManualPlayResolution)}
          >
            <option value="discard">Immediate discard</option>
            <option value="lasting">Lasting (own side)</option>
            <option value="lasting_target">Lasting on target card</option>
          </select>
        </label>

        {(targetKind === "player" || isCardTargetRequired) && (
          <label className={styles.row}>
            <span>Target owner</span>
            <select
              data-testid="manual-play-target-owner"
              value={targetOwner}
              onChange={e => setTargetOwner(e.target.value as "self" | "opponent")}
            >
              <option value="self">Self</option>
              <option value="opponent">Opponent</option>
            </select>
          </label>
        )}

        {isCardTargetRequired && (
          <label className={styles.row}>
            <span>Target card</span>
            <select
              data-testid="manual-play-target-card"
              value={targetCardId}
              onChange={e => setTargetCardId(e.target.value)}
            >
              {ownerTargets.length === 0 && <option value="">No target cards</option>}
              {ownerTargets.map(target => (
                <option key={target.cardInstanceId} value={target.cardInstanceId}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className={styles.actions}>
          <button className={styles.cancel} onClick={onClose}>Cancel</button>
          <button
            data-testid="manual-play-confirm"
            className={styles.confirm}
            disabled={!canSubmit}
            onClick={() => onPick({
              targetKind,
              resolution,
              ...(targetKind === "player" || isCardTargetRequired ? { targetOwner } : {}),
              ...(isCardTargetRequired && targetCardId ? { targetCardInstanceId: targetCardId } : {}),
            })}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
