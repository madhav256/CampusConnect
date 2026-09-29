import React from "react";

const internals =
  React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

/**
 * Lightweight, zero-dependency React hook testing harness for Node.js / Vitest.
 * Directly drives React 19's internal dispatcher (internals.H) to execute
 * hooks with realistic state, effects, dependencies, cleanups, and rerenders.
 *
 * Implements React-compliant batched updates: setState called during effect
 * execution queues an update that is flushed after the current pass settles,
 * preventing recursive re-entrant re-renders.
 *
 * @param {Function} hookFn - Hook callback function receiving props
 * @param {object} [options]
 * @param {any} [options.initialProps]
 * @returns {{
 *   result: { current: any },
 *   rerender: (newProps?: any) => void,
 *   unmount: () => void,
 * }}
 */
export function renderHook(hookFn, { initialProps } = {}) {
  let stateIndex = 0;
  const states = [];
  let effectIndex = 0;
  const effects = [];
  let memoIndex = 0;
  const memos = [];
  let refIndex = 0;
  const refs = [];

  let isMounted = true;
  let isExecuting = false;
  let hasPendingRerender = false;
  let currentProps = initialProps;
  const result = { current: null };

  function scheduleRerender() {
    if (!isMounted) return;
    if (isExecuting) {
      hasPendingRerender = true;
      return;
    }
    executeRender(currentProps);
  }

  function executeRender(props) {
    if (!isMounted) return;
    isExecuting = true;
    hasPendingRerender = false;

    stateIndex = 0;
    effectIndex = 0;
    memoIndex = 0;
    refIndex = 0;
    currentProps = props;

    internals.H = {
      useState(initialValue) {
        const i = stateIndex++;
        if (states.length <= i) {
          states[i] =
            typeof initialValue === "function" ? initialValue() : initialValue;
        }
        const setState = (newValue) => {
          if (!isMounted) return;
          const next =
            typeof newValue === "function" ? newValue(states[i]) : newValue;
          if (!Object.is(states[i], next)) {
            states[i] = next;
            scheduleRerender();
          }
        };
        return [states[i], setState];
      },

      useEffect(effectFn, deps) {
        const i = effectIndex++;
        const prev = effects[i];
        const hasChanged =
          !prev ||
          !deps ||
          deps.some((d, idx) => !Object.is(d, prev.deps[idx]));
        effects[i] = {
          effectFn,
          deps,
          hasChanged,
          cleanup: prev?.cleanup,
        };
      },

      useMemo(computeFn, deps) {
        const i = memoIndex++;
        const prev = memos[i];
        const hasChanged =
          !prev ||
          !deps ||
          deps.some((d, idx) => !Object.is(d, prev.deps[idx]));
        if (hasChanged) {
          memos[i] = { value: computeFn(), deps };
        }
        return memos[i].value;
      },

      useCallback(callbackFn, deps) {
        const i = memoIndex++;
        const prev = memos[i];
        const hasChanged =
          !prev ||
          !deps ||
          deps.some((d, idx) => !Object.is(d, prev.deps[idx]));
        if (hasChanged) {
          memos[i] = { value: callbackFn, deps };
        }
        return memos[i].value;
      },

      useRef(initialValue) {
        const i = refIndex++;
        if (refs.length <= i) {
          refs[i] = { current: initialValue };
        }
        return refs[i];
      },
    };

    result.current = hookFn(currentProps);

    // Run active effects whose dependencies changed
    for (const eff of effects) {
      if (eff.hasChanged) {
        if (typeof eff.cleanup === "function") {
          eff.cleanup();
        }
        eff.cleanup = eff.effectFn();
        eff.hasChanged = false;
      }
    }

    isExecuting = false;

    // Flush any pending updates queued during the effect phase
    if (hasPendingRerender && isMounted) {
      executeRender(currentProps);
    }
  }

  executeRender(initialProps);

  return {
    result,
    rerender: (newProps) => executeRender(newProps),
    unmount: () => {
      isMounted = false;
      for (const eff of effects) {
        if (typeof eff?.cleanup === "function") {
          eff.cleanup();
          eff.cleanup = null;
        }
      }
    },
  };
}

/**
 * Async helper to flush pending promises and ensure state updates settle.
 *
 * @param {Function} asyncFn
 * @returns {Promise<any>}
 */
export async function act(asyncFn) {
  const result = await asyncFn();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return result;
}
