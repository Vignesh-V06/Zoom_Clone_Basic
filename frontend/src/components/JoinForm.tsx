"use client";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { getMeeting, joinMeeting, normalizeMeetingCode } from "@/lib/api";

export default function JoinForm({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter(); const [meeting, setMeeting] = useState(initialCode); const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const code = normalizeMeetingCode(meeting);
    try { const found = await getMeeting(code); if (found.status === "ended") throw new Error("This meeting has ended."); const participant = await joinMeeting(code, name.trim()); sessionStorage.setItem(`zoom-participant-${code}`, String(participant.participant_id)); sessionStorage.setItem(`zoom-name-${code}`, participant.display_name); router.push(`/meeting/${encodeURIComponent(code)}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't join the meeting."); setBusy(false); }
  }
  return <section className="join-card"><div className="join-mark">↗</div><span className="eyebrow">JOIN A CONVERSATION</span><h1>Join meeting</h1><p className="form-intro">Enter the meeting ID or invite link and the name others will see.</p><form onSubmit={submit} className="meeting-form">
    <label>Meeting ID or invite link<input required value={meeting} onChange={(event) => setMeeting(event.target.value)} placeholder="e.g. 381-204-916" /></label><label>Your display name<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your name" /></label>
    {error && <p className="inline-error" role="alert">{error}</p>}<button className="primary-button full" disabled={busy}>{busy ? "Joining…" : "Join meeting"}</button>
  </form></section>;
}
