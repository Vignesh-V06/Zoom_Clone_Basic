"use client";
import { useEffect, useState } from "react";
import { endMeeting } from "@/lib/api";

type Conflict = { meeting_code: string; title?: string; message?: string; retry: () => Promise<unknown>; cancel: () => void };

export default function MeetingConflictDialog() {
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onConflict = (event: Event) => {
      setConflict((event as CustomEvent<Conflict>).detail);
      setBusy(false);
      setError("");
    };
    window.addEventListener("zoom-meeting-conflict", onConflict);
    return () => window.removeEventListener("zoom-meeting-conflict", onConflict);
  }, []);

  async function endOtherMeeting() {
    if (!conflict) return;
    setBusy(true);
    setError("");
    try {
      await endMeeting(conflict.meeting_code);
      sessionStorage.removeItem(`zoom-host-${conflict.meeting_code}`);
      sessionStorage.removeItem(`zoom-participant-${conflict.meeting_code}`);
      sessionStorage.removeItem(`zoom-name-${conflict.meeting_code}`);
      sessionStorage.removeItem(`zoom-mode-${conflict.meeting_code}`);
      await conflict.retry();
      setConflict(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't end the current meeting.");
    } finally {
      setBusy(false);
    }
  }

  if (!conflict) return null;
  return <div className="meeting-conflict-backdrop" role="dialog" aria-modal="true" aria-labelledby="meeting-conflict-title">
    <button className="meeting-conflict-back" onClick={() => { conflict.cancel(); setConflict(null); }}>‹ Back</button>
    <div className="meeting-conflict-content">
      <h2 id="meeting-conflict-title">You have a meeting that is currently in-progress. Please end it to start a new meeting.</h2>
      {conflict.title && <p className="meeting-conflict-name">{conflict.title}</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="meeting-conflict-actions"><button className="meeting-conflict-cancel" onClick={() => { conflict.cancel(); setConflict(null); }}>Cancel</button><button className="meeting-conflict-end" onClick={endOtherMeeting} disabled={busy}>{busy ? "Ending…" : "End other meeting"}</button></div>
    </div>
  </div>;
}
