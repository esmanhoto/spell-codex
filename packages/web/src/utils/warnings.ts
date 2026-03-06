export type WarningCode =
  | "structural_error"
  | "duplicate_in_game"
  | "world_mismatch_attachment"
  | "generic_warning"

const STORAGE_KEY = "spell.warning.suppressed"

function classifyWarningCodeFromMessage(message: string): WarningCode {
  const m = message.toLowerCase()

  if (m.includes("rule of cosmos") || m.includes("duplicate in-play cosmos"))
    return "duplicate_in_game"
  if (
    m.includes("world mismatch") ||
    (m.includes("holding") && m.includes("realm") && m.includes("world")) ||
    (m.includes("magical item") && m.includes("champion") && m.includes("world"))
  ) {
    return "world_mismatch_attachment"
  }
  if (
    m.includes("structural") ||
    m.includes("invalid") ||
    m.includes("card instance") ||
    m.includes("cannot switch to semi_auto")
  ) {
    return "structural_error"
  }
  return "generic_warning"
}

function classifyWarningCodeFromServerCode(code: string): WarningCode | null {
  if (code === "COSMOS_VIOLATION" || code === "COSMOS_DUPLICATE_IN_PLAY") return "duplicate_in_game"
  if (code === "WORLD_MISMATCH_HOLDING" || code === "WORLD_MISMATCH_MAGICAL_ITEM") {
    return "world_mismatch_attachment"
  }
  if (
    code === "MANUAL_STATE_INVALID" ||
    code.startsWith("STRUCTURAL_") ||
    code === "INVALID_TARGET" ||
    code === "TARGET_NOT_FOUND"
  ) {
    return "structural_error"
  }
  return null
}

export function classifyWarningCode(
  input: { message?: string; code?: string } | string,
): WarningCode {
  if (typeof input === "string") return classifyWarningCodeFromMessage(input)
  const byCode = input.code ? classifyWarningCodeFromServerCode(input.code) : null
  if (byCode) return byCode
  if (input.message) return classifyWarningCodeFromMessage(input.message)
  return "generic_warning"
}

export function readSuppressedWarnings(): Set<WarningCode> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as string[]
    return new Set(parsed as WarningCode[])
  } catch {
    return new Set()
  }
}

export function persistSuppressedWarnings(codes: Set<WarningCode>): void {
  if (typeof window === "undefined") return
  const value = JSON.stringify([...codes])
  window.localStorage.setItem(STORAGE_KEY, value)
}
