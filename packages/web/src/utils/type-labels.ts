export interface TypeInfo {
  label: string
  color: string
}

// Type IDs match engine's CardTypeId constants (packages/engine/src/constants.ts)
const TYPE_MAP: Record<number, TypeInfo> = {
  0: { label: "GENERIC", color: "#888" },
  1: { label: "ALLY", color: "#e95" },
  2: { label: "ARTIFACT", color: "#b8a" },
  3: { label: "BLOOD ABILITY", color: "#c55" },
  4: { label: "CLERIC SPELL", color: "#adf" },
  5: { label: "CHAMPION", color: "#e55" },
  6: { label: "EVENT", color: "#ff0" },
  7: { label: "CHAMPION", color: "#e55" },
  8: { label: "HOLDING", color: "#7ec8e3" },
  9: { label: "MAGIC ITEM", color: "#da7" },
  10: { label: "CHAMPION", color: "#e55" },
  11: { label: "PSIONIC POWER", color: "#e7a" },
  12: { label: "CHAMPION", color: "#e55" },
  13: { label: "REALM", color: "#4a9" },
  14: { label: "CHAMPION", color: "#e55" },
  15: { label: "RULE", color: "#aaa" },
  16: { label: "CHAMPION", color: "#e55" },
  17: { label: "THIEF SKILL", color: "#ea8" },
  18: { label: "UNARMED COMBAT", color: "#da5" },
  19: { label: "WIZARD SPELL", color: "#a7e" },
  20: { label: "CHAMPION", color: "#e55" },
  21: { label: "DUNGEON", color: "#8a8" },
}

const CHAMPION_TYPE_IDS = new Set([5, 7, 10, 12, 14, 16, 20])

export function getTypeInfo(typeId: number): TypeInfo {
  return TYPE_MAP[typeId] ?? { label: `TYPE ${typeId}`, color: "#888" }
}

export function isChampion(typeId: number): boolean {
  return CHAMPION_TYPE_IDS.has(typeId)
}
