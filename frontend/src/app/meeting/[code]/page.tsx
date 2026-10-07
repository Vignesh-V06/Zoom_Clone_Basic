"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { endMeeting, formatMeetingTime, getMeeting, leaveMeeting, type Meeting } from "@/lib/api";

export default function MeetingRoomPage() {
  const params = useParams<{ code: string }>(); const code = decodeURIComponent(params.code); const router = useRouter();
  const [meeting, setMeeting] = useState<Meeting | null>(null); const [isHost, setIsHost] = useState(false); const [ownName, setOwnName] = useState("Guest"); const [ownParticipantId, setOwnParticipantId] = useState(0); const [muted, setMuted] = useState(false); const [cameraOff, setCameraOff] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    setIsHost(sessionStorage.getItem(`zoom-host-${code}`) === "true");
    setOwnName(sessionStorage.getItem(`zoom-name-${code}`) || "Guest");
    setOwnParticipantId(Number(sessionStorage.getItem(`zoom-participant-${code}`)) || 0);
    const refreshMeeting = () => getMeeting(code).then(setMeeting).catch((cause) => setError(cause.message));
    refreshMeeting();
    const refreshTimer = window.setInterval(refreshMeeting, 5000);
    return () => window.clearInterval(refreshTimer);
  }, [code]);
  async function exitMeeting() {
    setBusy(true); setError("");
    try { if (isHost) { await endMeeting(code); sessionStorage.removeItem(`zoom-host-${code}`); } else { const id = Number(sessionStorage.getItem(`zoom-participant-${code}`)); if (id) await leaveMeeting(code, id); sessionStorage.removeItem(`zoom-participant-${code}`); sessionStorage.removeItem(`zoom-name-${code}`); } router.push("/"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't leave the meeting."); setBusy(false); }
  }
  return <div className="room-page"><div className="room-heading"><div className="room-meta"><strong>{meeting?.title ?? "Meeting room"}</strong><span>ID {code}</span></div><button className="copy-link" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/join/${code}`)}>Copy invite link</button></div>
    <div className="room-stage"><div className="video-grid"><div className="video-tile self-tile"><div className="tile-avatar">{isHost ? "V" : ownName.charAt(0).toUpperCase()}</div><span className="tile-name">{isHost ? "Vignesh V (You · Host)" : `${ownName} (You)`}</span><span className="tile-status">{cameraOff ? "Camera off" : "Your video preview"}</span></div>
      {meeting?.participants.filter((person) => person.id !== ownParticipantId && !(person.role === "host" && isHost)).map((person) => <div className="video-tile guest-tile" key={person.id}><div className="tile-avatar guest-avatar">{person.display_name.charAt(0).toUpperCase()}</div><span className="tile-name">{person.display_name}{person.role === "host" ? " · Host" : ""}</span><span className="tile-status">Waiting for video</span></div>)}
      {meeting && meeting.participant_count <= 1 && <div className="waiting-note"><span>＋</span><strong>You’re all set</strong><p>Share the invite link when you’re ready for others to join.</p><button className="outline-button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/join/${code}`)}>Copy invite link</button></div>}
    </div><aside className="room-side"><span className="eyebrow">MEETING DETAILS</span><h2>{meeting?.title ?? "Loading meeting…"}</h2><p>{meeting ? formatMeetingTime(meeting.start_time) : ""}</p><div className="room-detail"><span>Meeting ID</span><strong>{code}</strong></div><div className="room-detail"><span>Participants</span><strong>{meeting?.participant_count ?? "—"}</strong></div>{meeting?.description && <p className="room-description">{meeting.description}</p>}</aside></div>
    <div className="meeting-toolbar"><button className={`control-button ${muted ? "control-active" : ""}`} onClick={() => setMuted(!muted)}><span>{muted ? "♩̸" : "♩"}</span><small>{muted ? "Unmute" : "Mute"}</small></button><button className={`control-button ${cameraOff ? "control-active" : ""}`} onClick={() => setCameraOff(!cameraOff)}><span>{cameraOff ? "◌" : "▰"}</span><small>{cameraOff ? "Start video" : "Stop video"}</small></button><button className="control-button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/join/${code}`)}><span>↗</span><small>Invite</small></button><button className="control-button" onClick={() => setError("Screen sharing is a visual placeholder in this MVP.")}><span>▣</span><small>Share</small></button><button className="leave-button" onClick={exitMeeting} disabled={busy}>{busy ? "Leaving…" : isHost ? "End meeting" : "Leave"}</button></div>
    {error && <div className="toast" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
  </div>;
}
