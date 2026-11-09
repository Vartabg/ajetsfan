const CODE = /^[a-z0-9_-]{1,48}$/;
const MAX_REASONS = 12;

/**
 * Names a failure with one of our own fixed codes. It reads only the error's
 * class and an HTTP status number, so provider text can never reach a log.
 * @param {unknown} error
 */
export function failureReason(error) {
  const name = typeof error?.name === 'string' ? error.name : '';
  if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
  const status = typeof error?.message === 'string' ? /\bHTTP ([1-5]\d\d)\b/.exec(error.message)?.[1] : null;
  if (status) return `http_${status}`;
  if (name === 'SyntaxError') return 'unreadable';
  if (name === 'TypeError') return 'network_or_type';
  return 'rejected';
}

/**
 * Collects which source failed and why during one refresh. Anything that is not
 * a short fixed code is dropped rather than cleaned up.
 */
export function reasonCollector() {
  /** @type {{source: string, reason: string}[]} */
  const reasons = [];
  /** @param {string} _message @param {{source?: unknown, reason?: unknown}} [detail] */
  const onError = (_message, detail) => {
    const pair = safePair(detail);
    if (!pair || reasons.length >= MAX_REASONS || reasons.some((entry) => entry.source === pair.source && entry.reason === pair.reason)) return;
    reasons.push(pair);
  };
  /** @template T @param {T} result @returns {T & {reasons?: {source: string, reason: string}[]}} */
  const attach = (result) => reasons.length ? { ...result, reasons: [...reasons] } : result;
  return {
    onError, attach,
    /**
     * Wraps the publisher so a throw is recorded before the coordinator replaces it with its own error.
     * @template {(...args: any[]) => Promise<any>} F @param {F} publish @returns {F}
     */
    guard(publish) {
      return /** @type {F} */ (async (...args) => {
        try { return await publish(...args); }
        catch (error) { onError('', { source: 'publisher', reason: failureReason(error) }); throw error; }
      });
    },
    /**
     * Runs one coordinated refresh. Reasons ride on the result, or on the error when it throws.
     * @template T @param {() => Promise<T>} work
     */
    async report(work) {
      try { return attach(await work()); }
      catch (error) {
        if (reasons.length && error && typeof error === 'object') Object.assign(error, { refreshReasons: [...reasons] });
        throw error;
      }
    },
  };
}

/** @param {any} detail @returns {{source: string, reason: string} | null} */
function safePair(detail) {
  const source = detail?.source, reason = detail?.reason;
  return typeof source === 'string' && typeof reason === 'string' && CODE.test(source) && CODE.test(reason) ? { source, reason } : null;
}

/**
 * The fixed code for a refresh that threw before it could report a result.
 * @param {unknown} error
 */
export function cronFailureCode(error) {
  const name = typeof error?.name === 'string' ? error.name : '';
  if (name.endsWith('RefreshCoordinatorError') && typeof error.code === 'string' && CODE.test(error.code)) return error.code;
  if (typeof error?.message === 'string' && /^Hosted [a-z]+ refresh is not configured$/.test(error.message)) return 'not_configured';
  return 'unexpected';
}

/**
 * One structured log line per cron run. A run that kept old data is a warning,
 * so it shows up in the logs instead of hiding among the healthy runs.
 * @param {string} event @param {{status?: unknown, reasons?: unknown[], [key: string]: unknown}} result
 * @returns {{level: 'info' | 'warn', line: string}}
 */
export function cronOutcome(event, result) {
  const level = result.status === 'degraded' || result.reasons?.length ? 'warn' : 'info';
  return { level, line: JSON.stringify({ event, ...result }) };
}

/**
 * The log line for a refresh that threw. Only the fixed code, the error's class
 * name and any collected reason codes are recorded.
 * @param {string} event @param {unknown} error
 */
export function cronFailure(event, error) {
  const name = typeof error?.name === 'string' && /^[A-Z][A-Za-z]{2,39}$/.test(error.name) ? error.name : 'Error';
  const reasons = Array.isArray(error?.refreshReasons) ? error.refreshReasons.slice(0, MAX_REASONS).map(safePair).filter(Boolean) : [];
  return JSON.stringify({ event, status: 'unavailable', code: cronFailureCode(error), errorName: name, ...(reasons.length ? { reasons } : {}) });
}
