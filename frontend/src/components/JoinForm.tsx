"use client";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { getClientId, getMeeting, getProfile, joinMeeting, MeetingConflictError, normalizeMeetingCode } from "@/lib/api";

export default function JoinForm({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter(); const [meeting, setMeeting] = useState(initialCode); const [browserJoin, setBrowserJoin] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const code = normalizeMeetingCode(meeting);
    try { const found = await getMeeting(code); if (found.status === "ended") throw new Error("This meeting has ended."); const profile = await getProfile(); const participant = await joinMeeting(code, profile.display_name, getClientId()); sessionStorage.setItem(`zoom-participant-${code}`, String(participant.participant_id)); sessionStorage.setItem(`zoom-name-${code}`, participant.display_name); if (participant.role === "host") sessionStorage.setItem(`zoom-host-${code}`, "true"); sessionStorage.setItem(`zoom-mode-${code}`, "video-off"); router.push(`/meeting/${encodeURIComponent(code)}`); }
    catch (cause) { if (!(cause instanceof MeetingConflictError)) setError(cause instanceof Error ? cause.message : "Couldn't join the meeting."); setBusy(false); }
  }
  return <section className="join-card zoom-join-card"><h1>Join Meeting</h1><form onSubmit={submit} className="zoom-join-form">
    <label htmlFor="join-meeting-code">Meeting ID or Personal Link Name</label><input id="join-meeting-code" required value={meeting} onChange={(event) => setMeeting(event.target.value)} placeholder="Enter Meeting ID or Personal Link Name" />
    <label className="browser-join-option"><input type="checkbox" checked={browserJoin} onChange={(event) => setBrowserJoin(event.target.checked)} /> Always join from browser</label>
    {error && <p className="inline-error" role="alert">{error}</p>}<button className="zoom-join-submit" disabled={busy || !meeting.trim()}>{busy ? "Joining…" : "Join"}</button>
    <button type="button" className="sip-link" onClick={() => setError("Room system joining is not part of this MVP.")}>Join a meeting from an H.323/SIP room system</button>
  </form></section>;
}
