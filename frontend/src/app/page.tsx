"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createMeeting, formatMeetingTime, getClientId, getDeviceId, getDashboard, getProfile, MeetingConflictError, type DashboardData, type Meeting, type Profile } from "@/lib/api";
import { CopyIcon, EmptyRecentIcon, HostIcon, JoinIcon, ScheduleIcon } from "@/components/DashboardIcons";

function MeetingRow({ meeting, onJoin, onCopy, copied, recent = false }: { meeting: Meeting; onJoin: (meeting: Meeting) => void; onCopy: (meeting: Meeting) => void; copied: boolean; recent?: boolean }) {
  return <article className="meeting-row"><div className="date-block"><span>{new Date(meeting.start_time).toLocaleDateString("en-IN", { month: "short" }).toUpperCase()}</span><strong>{new Date(meeting.start_time).getDate()}</strong></div><div className="meeting-info"><strong>{meeting.title}</strong><span>{formatMeetingTime(meeting.start_time)} · {meeting.duration_minutes} min · ID {meeting.meeting_code}</span></div><div className="meeting-row-actions">{recent && meeting.status === "ended" ? <span className="meeting-status">Ended</span> : <button className="small-primary" onClick={() => onJoin(meeting)}>Join</button>}{meeting.status !== "ended" && <button className="meeting-copy-link" onClick={() => onCopy(meeting)}>{copied ? "Copied" : "Copy invite"}</button>}</div></article>;
}
export default function HomePage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData>({ upcoming: [], recent: [] });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<number | null>(null);
  useEffect(() => {
    Promise.all([getDashboard(), getProfile()])
      .then(([dashboard, userProfile]) => { setData(dashboard); setProfile(userProfile); })
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);
  async function hostNow() {
    setWorking(true); setError("");
    try { const meeting = await createMeeting({ meeting_type: "instant", title: "New meeting", client_id: getClientId(), device_id: getDeviceId() }); sessionStorage.setItem(`zoom-host-${meeting.meeting_code}`, "true"); sessionStorage.setItem(`zoom-mode-${meeting.meeting_code}`, "video-on"); sessionStorage.setItem(`zoom-name-${meeting.meeting_code}`, meeting.host_name); const hostParticipant = meeting.participants.find((participant) => participant.client_id === getClientId()); if (hostParticipant) sessionStorage.setItem(`zoom-participant-${meeting.meeting_code}`, String(hostParticipant.id)); router.push(`/meeting/${encodeURIComponent(meeting.meeting_code)}`); }
    catch (cause) { if (!(cause instanceof MeetingConflictError)) setError(cause instanceof Error ? cause.message : "Couldn't start the meeting."); setWorking(false); }
  }
  function openMeeting(meeting: Meeting) { router.push(`/join/${encodeURIComponent(meeting.meeting_code)}`); }
  async function copyMeetingInvite(meeting: Meeting) {
    const inviteUrl = `${window.location.origin}${meeting.invite_path}`;
    try { await navigator.clipboard.writeText(inviteUrl); setCopiedInviteId(meeting.id); window.setTimeout(() => setCopiedInviteId(null), 1800); }
    catch { setError(`Copy this invite link: ${inviteUrl}`); }
  }
  async function copyPersonalId() {
    if (!profile) return;
    try { await navigator.clipboard.writeText(profile.personal_meeting_code); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError("Clipboard access is unavailable. You can select and copy the ID manually."); }
  }
  return <div className="dashboard page-width">
    <section className="welcome-card"><div className="welcome-avatar">{profile?.display_name.charAt(0) ?? "V"}</div><div className="welcome-copy"><span className="eyebrow">YOUR MEETING SPACE</span><h1>Good to see you, {profile?.display_name ?? "Vignesh V"}</h1><p>Start a meeting or pick up where you left off.</p></div></section>
    <div className="dashboard-grid"><section className="main-column">
      <section className="content-card"><div className="section-heading"><div><span className="eyebrow">PLAN AHEAD</span><h2>Upcoming meetings</h2></div><Link href="/schedule" className="text-link">Schedule a meeting →</Link></div>
        {loading ? <p className="empty-state">Loading your meetings…</p> : data.upcoming.length ? data.upcoming.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} onJoin={openMeeting} onCopy={copyMeetingInvite} copied={copiedInviteId === meeting.id} />) : <p className="empty-state">No upcoming meetings. Schedule one when you’re ready.</p>}
      </section>
      <section className="content-card recent-card"><div className="section-heading"><div><span className="eyebrow">YOUR HISTORY</span><h2>Recent activity</h2></div></div>{loading ? <p className="empty-state">Loading recent meetings…</p> : data.recent.length ? data.recent.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} onJoin={openMeeting} onCopy={copyMeetingInvite} copied={copiedInviteId === meeting.id} recent />) : <div className="recent-empty"><EmptyRecentIcon /><strong>No recent activity</strong></div>}</section>
    </section><aside className="side-column">
      <section className="content-card quick-card"><div className="quick-actions">
        <Link className="quick-action" href="/schedule"><span className="quick-icon"><ScheduleIcon /></span><strong>Schedule</strong></Link>
        <Link className="quick-action" href="/join"><span className="quick-icon"><JoinIcon /></span><strong>Join</strong></Link>
        <button className="quick-action" onClick={hostNow} disabled={working}><span className="quick-icon host-icon"><HostIcon /></span><strong>{working ? "Starting…" : "Host"}</strong></button>
      </div><div className="personal-heading">Personal Meeting ID</div><div className="personal-id">{profile ? profile.personal_meeting_code.replaceAll("-", " ") : "Loading…"}<button className="copy-id-button" aria-label="Copy Personal Meeting ID" title="Copy Personal Meeting ID" onClick={copyPersonalId} disabled={!profile}><CopyIcon /></button></div><p className={`copy-feedback ${copied ? "visible" : ""}`} aria-live="polite">{copied ? "Personal Meeting ID copied" : "Share this ID to invite someone to your personal room."}</p></section>
    </aside></div>{error && <p className="inline-error" role="alert">{error}</p>}<footer className="app-footer">Zoom Clone <span>·</span> Meetings made simple</footer>
  </div>;
}
