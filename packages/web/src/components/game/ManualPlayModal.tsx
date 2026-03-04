import { useEffect, useMemo, useState } from "react"
import type { CardInfo, ManualPlayResolution, ManualPlayTargetKind } from "../../api.ts"
import styles from "./ManualPlayModal.module.css"

export interface ManualPlayTargetOption {
  cardInstanceId: string
  label: string
  owner: "self" | "opponent"
  kind: "card" | "realm"
  realmSlot?: string
}

export function ManualPlayModal({
  card,
  targets,
  selfRealmSlots,
  onPick,
  onClose,
}: {
  card: CardInfo
  targets: ManualPlayTargetOption[]
  selfRealmSlots: string[]
  onPick: (selection: {
    targetKind: ManualPlayTargetKind
    resolution: ManualPlayResolution
    targetOwner?: "self" | "opponent"
    targetCardInstanceId?: string
    targetRealmSlot?: string
  }) => void
  onClose: () => void
}) {
  const isRealmCard = card.typeId === 13
  const isHoldingCard = card.typeId === 8
  const [targetKind, setTargetKind] = useState<ManualPlayTargetKind>(
    isRealmCard || isHoldingCard ? "realm" : "none",
  )
  const [resolution, setResolution] = useState<ManualPlayResolution>("discard")
  const [targetOwner, setTargetOwner] = useState<"self" | "opponent">("self")
  const ownerTargets = useMemo(() => {
    const requiredKind = targetKind === "realm" ? "realm" : "card"
    return targets.filter((t) => t.owner === targetOwner && t.kind === requiredKind)
  }, [targetKind, targetOwner, targets])
  const [targetCardId, setTargetCardId] = useState<string>("")
  const [targetRealmSlot, setTargetRealmSlot] = useState<string>(selfRealmSlots[0] ?? "A")

  useEffect(() => {
    if (ownerTargets.length === 0) {
      setTargetCardId("")
      return
    }
    if (!ownerTargets.some((t) => t.cardInstanceId === targetCardId)) {
      setTargetCardId(ownerTargets[0]!.cardInstanceId)
    }
  }, [ownerTargets, targetCardId])

  useEffect(() => {
    if (selfRealmSlots.length === 0) return
    if (!selfRealmSlots.includes(targetRealmSlot)) {
      setTargetRealmSlot(selfRealmSlots[0]!)
    }
  }, [selfRealmSlots, targetRealmSlot])

  useEffect(() => {
    if (targetKind === "pool" && resolution !== "lasting") {
      setResolution("lasting")
    }
  }, [targetKind, resolution])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const effectiveTargetKind = isRealmCard ? "realm" : targetKind
  const effectiveResolution = isRealmCard ? "lasting" : resolution
  const effectiveTargetOwner = isRealmCard ? "self" : targetOwner
  const isCardTargetRequired =
    !isRealmCard &&
    (effectiveTargetKind === "card" ||
      effectiveTargetKind === "realm" ||
      effectiveResolution === "lasting_target")
  const canSubmit = isRealmCard
    ? targetRealmSlot.length > 0
    : !isCardTargetRequired || targetCardId.length > 0
  const canTargetRealm = isRealmCard || isHoldingCard
  const canTargetPool = card.typeId !== 13 && card.typeId !== 8

  return (
    <div className={styles.backdrop} data-testid="manual-play-modal" onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>Play/Cast</div>
        <div className={styles.message}>
          Choose how to resolve <strong>{card.name}</strong>.
        </div>

        {!isRealmCard && (
          <label className={styles.row}>
            <span>Target</span>
            <select
              data-testid="manual-play-target-kind"
              value={targetKind}
              onChange={(e) => setTargetKind(e.target.value as ManualPlayTargetKind)}
            >
              <option value="none">None</option>
              <option value="player">Player</option>
              <option value="card">Card</option>
              {canTargetRealm && <option value="realm">Realm</option>}
              {canTargetPool && <option value="pool">Pool</option>}
            </select>
          </label>
        )}

        {!isRealmCard && (
          <label className={styles.row}>
            <span>Resolution</span>
            <select
              data-testid="manual-play-resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value as ManualPlayResolution)}
            >
              <option value="discard">Immediate discard</option>
              <option value="lasting">Lasting (own side)</option>
              {targetKind !== "pool" && (
                <option value="lasting_target">Lasting on target card</option>
              )}
            </select>
          </label>
        )}

        {isRealmCard && (
          <label className={styles.row}>
            <span>Slot</span>
            <select value={targetRealmSlot} onChange={(e) => setTargetRealmSlot(e.target.value)}>
              {selfRealmSlots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </label>
        )}

        {(effectiveTargetKind === "player" || isCardTargetRequired) && (
          <label className={styles.row}>
            <span>Target owner</span>
            <select
              data-testid="manual-play-target-owner"
              value={targetOwner}
              onChange={(e) => setTargetOwner(e.target.value as "self" | "opponent")}
            >
              <option value="self">Self</option>
              <option value="opponent">Opponent</option>
            </select>
          </label>
        )}

        {isCardTargetRequired && (
          <label className={styles.row}>
            <span>{effectiveTargetKind === "realm" ? "Target realm" : "Target card"}</span>
            <select
              data-testid="manual-play-target-card"
              value={targetCardId}
              onChange={(e) => setTargetCardId(e.target.value)}
            >
              {ownerTargets.length === 0 && <option value="">No target cards</option>}
              {ownerTargets.map((target) => (
                <option key={target.cardInstanceId} value={target.cardInstanceId}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className={styles.actions}>
          <button className={styles.cancel} onClick={onClose}>
            Cancel
          </button>
          <button
            data-testid="manual-play-confirm"
            className={styles.confirm}
            disabled={!canSubmit}
            onClick={() =>
              onPick({
                targetKind: effectiveTargetKind,
                resolution: effectiveResolution,
                ...(effectiveTargetKind === "player" || isCardTargetRequired
                  ? { targetOwner: effectiveTargetOwner }
                  : {}),
                ...(isRealmCard ? { targetOwner: "self", targetRealmSlot } : {}),
                ...(isCardTargetRequired && targetCardId
                  ? {
                      targetCardInstanceId: targetCardId,
                      ...(ownerTargets.find((t) => t.cardInstanceId === targetCardId)?.realmSlot
                        ? {
                            targetRealmSlot: ownerTargets.find(
                              (t) => t.cardInstanceId === targetCardId,
                            )!.realmSlot,
                          }
                        : {}),
                    }
                  : {}),
              })
            }
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
