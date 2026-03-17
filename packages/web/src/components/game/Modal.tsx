import { useCallback, type ReactNode } from "react"
import { useEscapeKey } from "../../hooks/useEscapeKey.ts"
import base from "./modal-base.module.css"

export function Modal({
  title,
  onClose,
  children,
  testId,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  testId?: string
}) {
  useEscapeKey(useCallback(() => onClose(), [onClose]))

  return (
    <div className={base.backdrop} onClick={onClose} data-testid={testId}>
      <div className={base.modal} onClick={(e) => e.stopPropagation()}>
        <div className={base.title}>{title}</div>
        {children}
      </div>
    </div>
  )
}

export { base as modalStyles }
