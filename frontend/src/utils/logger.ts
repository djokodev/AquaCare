/**
 * Centralized logger for AquaCare.
 *
 * Strategy:
 * - `log`, `info`, `debug` → DEV only (verbose, dev-time debugging)
 * - `warn`, `error` → ALWAYS active (visible in Xcode Console / adb logcat,
 *   never shown on screen to the user)
 *
 * This ensures TestFlight / Internal Testing builds produce useful
 * diagnostic logs for the developer while remaining invisible to fish farmers.
 *
 * When ready for full public production release, set ENABLE_PROD_LOGS = false
 * to silence warn/error as well.
 */

const ENABLE_PROD_LOGS = false;

const noop = (..._args: unknown[]) => {};

const logger = {
  log: __DEV__ ? console.log.bind(console) : noop,
  info: __DEV__ ? console.info.bind(console) : noop,
  debug: __DEV__ ? console.debug.bind(console) : noop,
  warn: __DEV__ || ENABLE_PROD_LOGS ? console.warn.bind(console) : noop,
  error: __DEV__ || ENABLE_PROD_LOGS ? console.error.bind(console) : noop,
};

export default logger;
