"use client";

import { useCallback, useRef, useState } from "react";

type ChatRun = {
  sessionId: string;
  runId: string | null;
  stopRequested: boolean;
};

/** Track each session independently, including runs still waiting for an ACK. */
export function useChatRuns(cancelRun: (runId: string) => void) {
  const runsRef = useRef(new Map<string, ChatRun>());
  const cancelRunRef = useRef(cancelRun);
  cancelRunRef.current = cancelRun;
  const [runs, setRuns] = useState<Record<string, { stopping: boolean }>>({});

  const publish = useCallback(() => {
    setRuns(
      Object.fromEntries(
        [...runsRef.current].map(([sessionId, run]) => [
          sessionId,
          { stopping: run.stopRequested },
        ]),
      ),
    );
  }, []);

  const startRun = useCallback(
    (sessionId: string) => {
      if (runsRef.current.has(sessionId)) return null;
      const run: ChatRun = { sessionId, runId: null, stopRequested: false };
      runsRef.current.set(sessionId, run);
      publish();
      return run;
    },
    [publish],
  );

  const acceptRun = useCallback((run: ChatRun, runId: string) => {
    run.runId = runId;
    // A stop click before the ACK must still cancel the accepted server run.
    if (run.stopRequested) cancelRunRef.current(runId);
  }, []);

  const resumeRun = useCallback(
    (sessionId: string, runId: string) => {
      const previous = runsRef.current.get(sessionId);
      const run: ChatRun = {
        sessionId,
        runId,
        stopRequested:
          !!previous?.stopRequested &&
          (!previous.runId || previous.runId === runId),
      };
      runsRef.current.set(sessionId, run);
      publish();
      if (run.stopRequested) cancelRunRef.current(runId);
      return run;
    },
    [publish],
  );

  const stopRun = useCallback(
    (sessionId: string) => {
      const run = runsRef.current.get(sessionId);
      if (!run || run.stopRequested) return;
      run.stopRequested = true;
      publish();
      if (run.runId) cancelRunRef.current(run.runId);
    },
    [publish],
  );

  const finishRun = useCallback(
    (run: ChatRun) => {
      // An old stream finishing must not clear a newer/reconnected run.
      if (runsRef.current.get(run.sessionId) !== run) return;
      runsRef.current.delete(run.sessionId);
      publish();
    },
    [publish],
  );

  return { runs, startRun, acceptRun, resumeRun, stopRun, finishRun };
}
