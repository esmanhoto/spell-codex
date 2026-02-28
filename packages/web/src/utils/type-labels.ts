export interface TypeInfo {
  label: string
  color: string
}

const TYPE_MAP: Record<number, TypeInfo> = {
  0:  { label: "REALM",        color: "#4a9" },
  1:  { label: "HOLDING",      color: "#7ec8e3" },
  2:  { label: "ARTIFACT",     color: "#b8a" },
  3:  { label: "MAGIC ITEM",   color: "#da7" },
  4:  { label: "RULE",         color: "#aaa" },
  5:  { label: "CHAMPION",     color: "#e55" },
  6:  { label: "ALLY",         color: "#e95" },
  7:  { label: "CHAMPION",     color: "#e55" },
  8:  { label: "SPELL",        color: "#a7e" },
  9:  { label: "THIEF SKILL",  color: "#ea8" },
  10: { label: "CHAMPION",     color: "#e55" },
  11: { label: "PSIONIC",      color: "#e7a" },
  12: { label: "CHAMPION",     color: "#e55" },
  13: { label: "BLOOD ABILITY", color: "#c55" },
  14: { label: "CHAMPION",     color: "#e55" },
  15: { label: "DUNGEON",      color: "#8a8" },
  16: { label: "CHAMPION",     color: "#e55" },
  17: { label: "UNARMED COMBAT", color: "#da5" },
  18: { label: "EVENT",        color: "#ff0" },
  19: { label: "CLERIC SPELL", color: "#adf" },
  20: { label: "CHAMPION",     color: "#e55" },
  21: { label: "HOLDING",      color: "#7ec8e3" },
}

const CHAMPION_TYPE_IDS = new Set([5, 7, 10, 12, 14, 16, 20])

export function getTypeInfo(typeId: number): TypeInfo {
  return TYPE_MAP[typeId] ?? { label: `TYPE ${typeId}`, color: "#888" }
}

export function isChampion(typeId: number): boolean {
  return CHAMPION_TYPE_IDS.has(typeId)
}
