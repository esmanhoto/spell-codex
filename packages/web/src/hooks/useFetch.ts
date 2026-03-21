import { useState, useEffect, useRef, useCallback } from "react"

interface UseFetchOptions<T> {
  fn: () => Promise<T>
  enabled?: boolean
  refetchInterval?: number | false | ((data: T | undefined) => number | false)
}

interface UseFetchResult<T> {
  data: T | undefined
  error: Error | null
  isLoading: boolean
  refetch: () => Promise<void>
  setData: (updater: T | ((prev: T | undefined) => T | undefined)) => void
}

export function useFetch<T>(opts: UseFetchOptions<T>): UseFetchResult<T> {
  const { fn, enabled = true, refetchInterval } = opts
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const mountedRef = useRef(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await fnRef.current()
      if (mountedRef.current) setData(result)
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    if (!enabled) return
    void refetch()
  }, [enabled, refetch])

  // Polling
  useEffect(() => {
    if (!enabled) return
    const interval =
      typeof refetchInterval === "function" ? refetchInterval(data) : refetchInterval
    if (interval === false || !interval) return
    const id = setInterval(() => void refetch(), interval)
    return () => clearInterval(id)
  }, [enabled, refetchInterval, data, refetch])

  return { data, error, isLoading, refetch, setData }
}

interface UseMutationOptions<T, V> {
  fn: (vars: V) => Promise<T>
  onSuccess?: () => void
}

export function useMutation<T, V>(opts: UseMutationOptions<T, V>) {
  const fnRef = useRef(opts.fn)
  fnRef.current = opts.fn
  const onSuccessRef = useRef(opts.onSuccess)
  onSuccessRef.current = opts.onSuccess

  const mutate = useCallback((vars: V) => {
    void fnRef.current(vars).then(() => onSuccessRef.current?.())
  }, [])

  return { mutate }
}
