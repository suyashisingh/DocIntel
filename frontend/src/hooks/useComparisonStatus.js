import { useEffect, useRef, useState } from 'react'

const WS_BASE = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000'

export function useComparisonStatus(comparisonId, initialStatus) {
  const [status, setStatus] = useState(initialStatus ?? null)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const wsRef = useRef(null)

  useEffect(() => {
    if (!comparisonId) return

    const isTerminal = initialStatus === 'completed' || initialStatus === 'failed'
    if (isTerminal) {
      setStatus(initialStatus)
      setProgress(initialStatus === 'completed' ? 100 : 0)
      return
    }

    const ws = new WebSocket(`${WS_BASE}/comparisons/ws/${comparisonId}/status`)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'ping') return
        if (data.status != null) setStatus(data.status)
        if (data.progress != null) setProgress(data.progress)
        if (data.message) setMessage(data.message)
      } catch {
        // ignore malformed frames
      }
    }

    ws.onerror = () => {
      // silently ignore — the server may not be running
    }

    return () => {
      ws.close()
    }
  }, [comparisonId, initialStatus])

  return { status: status ?? initialStatus, progress, message }
}
