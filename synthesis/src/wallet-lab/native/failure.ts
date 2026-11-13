export interface NativeFailureSnapshot {
  name: string
  message: string
  cause?: NativeFailureSnapshot
  errors?: NativeFailureSnapshot[]
}

interface NativeResourceClosers {
  closeBrowser(): Promise<unknown>
  closeServices(): Promise<unknown>
  removeProfile(): unknown
}

/** Even failure to initialize the receipt observer must close every resource.
 * Each close is attempted once; a failed close is retained, never silently retried. */
export async function captureWithNativeCleanup(
  capture: (close: NativeResourceClosers) => Promise<{ evidenceErrors: unknown[] }>,
  close: NativeResourceClosers
): Promise<{ cleanupErrors: unknown[]; evidenceErrors: unknown[] }> {
  const attempted = new Set<keyof NativeResourceClosers>()
  const cleanupErrors: unknown[] = [], evidenceErrors: unknown[] = []
  const attempt = async (name: keyof NativeResourceClosers) => {
    if (attempted.has(name)) throw new Error(`Native cleanup stage repeated: ${name}`)
    attempted.add(name)
    try { await close[name]() } catch (error) { cleanupErrors.push(error); throw error }
  }
  try {
    const result = await capture({ closeBrowser: () => attempt('closeBrowser'), closeServices: () => attempt('closeServices'), removeProfile: () => attempt('removeProfile') })
    evidenceErrors.push(...result.evidenceErrors)
  } catch (error) { evidenceErrors.push(error) }
  finally {
    for (const name of ['closeBrowser', 'closeServices', 'removeProfile'] as const) {
      if (!attempted.has(name)) try { await attempt(name) } catch { /* Retained above; continue remaining cleanup. */ }
    }
  }
  return { cleanupErrors, evidenceErrors }
}

/** Error.message alone loses both an original observer failure and the separate
 * shutdown evidence errors. Retain their causal tree without following cycles. */
export function nativeFailureSnapshot(error: unknown, ancestors = new Set<unknown>(), depth = 0): NativeFailureSnapshot {
  if (!(error instanceof Error)) return { name: 'ThrownValue', message: String(error) }
  if (ancestors.has(error)) return { name: error.name, message: '[circular error reference]' }
  if (depth >= 8) return { name: error.name, message: '[error nesting limit]' }
  const seen = new Set(ancestors).add(error)
  return {
    name: error.name, message: error.message,
    ...('cause' in error ? { cause: nativeFailureSnapshot(error.cause, seen, depth + 1) } : {}),
    ...(error instanceof AggregateError ? { errors: error.errors.map(item => nativeFailureSnapshot(item, seen, depth + 1)) } : {})
  }
}

/** A missing successful-run artifact is an evidence failure even when every
 * owned process closed. Both remain fatal; neither replaces the primary cause. */
export function nativeShutdownFailure(primary: { error: unknown } | undefined, cleanup: unknown[], evidence: unknown[]): AggregateError {
  const failures: unknown[] = []
  if (primary) failures.push(primary.error)
  if (cleanup.length) failures.push(new AggregateError(cleanup, 'Native wallet cleanup failed'))
  if (evidence.length) failures.push(new AggregateError(evidence, 'Native wallet shutdown evidence is incomplete'))
  if (!cleanup.length && !evidence.length) throw new Error('No shutdown failure to report')
  const summary = [cleanup.length ? 'cleanup failed' : '', evidence.length ? 'shutdown evidence is incomplete' : ''].filter(Boolean).join('; ')
  return new AggregateError(failures, primary ? `${nativeFailureSnapshot(primary.error).message}; ${summary}` : `Native wallet ${summary}`, primary ? { cause: primary.error } : undefined)
}
