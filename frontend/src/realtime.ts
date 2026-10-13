import { useEffect, useRef, useState } from 'react'

/**
 * Live updates. Keeps one connection open to GET /api/events; the server sends a short
 * "something changed" ping after any create/edit/delete, and we refresh what is on screen.
 * No project data travels over this connection.
 *
 * It uses fetch (not EventSource) because the browser's EventSource can't send the
 * "Authorization: Bearer ..." header that this API requires.
 */

export type RealtimeStatus = 'connecting' | 'live' | 'offline'

export type RealtimeOptions = {
  baseUrl: string
  token: string
  /** Called (at most once per burst of pings) when something changed, and again after a reconnect. */
  onChange: (topic: string) => void
  onStatus?: (status: RealtimeStatus) => void
  /** Wait this long after the first ping so a burst of changes causes one refresh. Default 250 ms. */
  debounceMs?: number
  /** Reconnect delay grows from min to max (doubling). Defaults: 1 s to 30 s. */
  minDelayMs?: number
  maxDelayMs?: number
}

/** Starts the live connection. Returns a function that stops it. */
export function connectRealtime(options: RealtimeOptions): () => void {
  const { baseUrl, token, onChange, onStatus, debounceMs = 250, minDelayMs = 1000, maxDelayMs = 30000 } = options

  let stopped = false
  let controller: AbortController | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let pendingTopic: string | null = null
  let attempt = 0
  let connectedBefore = false

  const setStatus = (status: RealtimeStatus) => { if (!stopped) onStatus?.(status) }

  const schedule = (topic: string) => {
    pendingTopic = topic
    if (debounceTimer) return
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined
      const t = pendingTopic ?? 'changed'
      pendingTopic = null
      if (!stopped) onChange(t)
    }, debounceMs)
  }

  const handleBlock = (block: string) => {
    let event = 'message'
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue // keep-alive comment
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).trim())
    }
    if (event === 'ready') {
      attempt = 0
      setStatus('live')
      // We may have missed changes while we were disconnected, so refresh once.
      if (connectedBefore) schedule('reconnected')
      connectedBefore = true
    } else if (event === 'change') {
      schedule(data.join('\n') || 'changed')
    }
  }

  const run = async () => {
    while (!stopped) {
      controller = new AbortController()
      let fatal = false
      try {
        setStatus('connecting')
        const res = await fetch(`${baseUrl}/api/events`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
          cache: 'no-store',
        })
        if (res.status === 401 || res.status === 403) fatal = true // signed out: don't keep knocking
        else if (!res.ok || !res.body) throw new Error(`Unexpected status ${res.status}`)
        else {
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
            let end: number
            while ((end = buffer.indexOf('\n\n')) >= 0) {
              handleBlock(buffer.slice(0, end))
              buffer = buffer.slice(end + 2)
            }
          }
        }
      } catch {
        /* network problem or we were stopped: fall through to the retry logic */
      }
      if (stopped || fatal) break

      setStatus('offline')
      const delay = Math.min(maxDelayMs, minDelayMs * 2 ** attempt++)
      await new Promise<void>(resolve => { retryTimer = setTimeout(resolve, delay + Math.random() * delay * 0.2) })
    }
    if (!stopped) setStatus('offline')
  }

  void run()

  return () => {
    stopped = true
    controller?.abort()
    clearTimeout(debounceTimer)
    clearTimeout(retryTimer)
  }
}

/**
 * React hook: stays connected while `token` is set (i.e. while someone is signed in) and
 * calls `onChange` whenever the server says something changed.
 */
export function useRealtime(baseUrl: string, token: string | undefined, onChange: () => void): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('connecting')
  const latest = useRef(onChange)
  useEffect(() => { latest.current = onChange })

  useEffect(() => {
    if (!token) return
    return connectRealtime({ baseUrl, token, onChange: () => latest.current(), onStatus: setStatus })
  }, [baseUrl, token])

  return token ? status : 'offline'
}
