import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'

export const RIGHT_RAIL_MIN_WIDTH = 240
export const RIGHT_RAIL_MAX_WIDTH = 640
export const RIGHT_RAIL_DEFAULT_WIDTH = 320

export const BOTTOM_DRAWER_MIN_HEIGHT = 180
export const BOTTOM_DRAWER_MAX_HEIGHT = 640
export const BOTTOM_DRAWER_DEFAULT_HEIGHT = 360

type ResizeAxis = 'horizontal' | 'vertical'

function clampSize(size: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(size)))
}

export function usePanelResize({
  axis,
  size,
  min,
  max,
  onSizeChange
}: {
  axis: ResizeAxis
  size: number
  min: number
  max: number
  onSizeChange: (size: number) => void
}): {
  isResizing: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void
} {
  const [isResizing, setIsResizing] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => cleanupRef.current?.()
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      if (event.button !== 0 || typeof window === 'undefined') return
      event.preventDefault()
      cleanupRef.current?.()

      const startCoordinate = axis === 'horizontal' ? event.clientX : event.clientY
      const startSize = size
      const body = document.body
      const previousCursor = body.style.cursor
      const previousUserSelect = body.style.userSelect
      const cursor = axis === 'horizontal' ? 'col-resize' : 'row-resize'

      const handleMove = (moveEvent: PointerEvent): void => {
        const currentCoordinate = axis === 'horizontal' ? moveEvent.clientX : moveEvent.clientY
        onSizeChange(clampSize(startSize + startCoordinate - currentCoordinate, min, max))
      }

      const handleEnd = (): void => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleEnd)
        window.removeEventListener('pointercancel', handleEnd)
        body.style.cursor = previousCursor
        body.style.userSelect = previousUserSelect
        cleanupRef.current = null
        setIsResizing(false)
      }

      cleanupRef.current = handleEnd
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleEnd)
      window.addEventListener('pointercancel', handleEnd)
      body.style.cursor = cursor
      body.style.userSelect = 'none'
      setIsResizing(true)
    },
    [axis, max, min, onSizeChange, size]
  )

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>): void => {
      const positiveKey = axis === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
      const negativeKey = axis === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
      const step = 24
      if (event.key === positiveKey) {
        event.preventDefault()
        onSizeChange(clampSize(size + step, min, max))
      } else if (event.key === negativeKey) {
        event.preventDefault()
        onSizeChange(clampSize(size - step, min, max))
      } else if (event.key === 'Home') {
        event.preventDefault()
        onSizeChange(min)
      } else if (event.key === 'End') {
        event.preventDefault()
        onSizeChange(max)
      }
    },
    [axis, max, min, onSizeChange, size]
  )

  return { isResizing, onPointerDown, onKeyDown }
}
