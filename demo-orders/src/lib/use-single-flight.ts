import * as React from "react";

/**
 * Runs one async action at a time: a second tap while the first request is in
 * flight is ignored, so a slow network cannot create the same record twice.
 */
export function useSingleFlight() {
  const inFlight = React.useRef(false);
  const [busy, setBusy] = React.useState(false);

  const run = React.useCallback(async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
