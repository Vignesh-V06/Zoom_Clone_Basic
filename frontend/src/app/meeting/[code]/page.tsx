"use client";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { endMeeting, formatMeetingTime, getClientId, getMeeting, getMeetingIceServers, getMeetingSignals, leaveMeeting, sendMeetingSignal, type Meeting, type MeetingSignal } from "@/lib/api";
import { MeetingIcon } from "@/components/MeetingIcons";

type StartMode = "video-on" | "video-off" | "screen-share";
type PeerLink = { connection: RTCPeerConnection; audioSender: RTCRtpSender; videoSender: RTCRtpSender };

function StreamVideo({ stream, audioEnabled }: { stream: MediaStream; audioEnabled: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackCount = stream.getTracks().length;
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    void videoRef.current.play().catch(() => undefined);
  }, [stream, trackCount]);
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.srcObject = stream;
    if (audioEnabled) void audioRef.current.play().catch(() => undefined);
  }, [stream, trackCount, audioEnabled]);
  return <><video ref={videoRef} autoPlay playsInline muted /><audio ref={audioRef} autoPlay playsInline muted={!audioEnabled} /></>;
}

export default function MeetingRoomPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code);
  const router = useRouter();
  const selfVideo = useRef<HTMLVideoElement>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const peerLinks = useRef(new Map<string, PeerLink>());
  const clientIdRef = useRef("");
  const signalCursor = useRef(0);
  const pendingCandidates = useRef(new Map<string, RTCIceCandidateInit[]>());
  const iceServers = useRef<RTCIceServer[]>([{ urls: "stun:stun.l.google.com:19302" }]);
  const polling = useRef(false);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [ownName, setOwnName] = useState("Guest");
  const [ownParticipantId, setOwnParticipantId] = useState(0);
  const [mode, setMode] = useState<StartMode>("video-off");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [muted, setMuted] = useState(true);
  const [audioPlaybackEnabled, setAudioPlaybackEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [clientId, setClientId] = useState("");

  function syncLocalTracks() {
    const stream = mediaStream.current;
    const audioTrack = stream?.getAudioTracks().find((track) => track.readyState === "live") ?? null;
    const videoTrack = stream?.getVideoTracks().find((track) => track.readyState === "live") ?? null;
    for (const link of peerLinks.current.values()) {
      void link.audioSender.replaceTrack(audioTrack).catch(() => undefined);
      void link.videoSender.replaceTrack(videoTrack).catch(() => undefined);
    }
  }

  useEffect(() => {
    const effectPeerLinks = peerLinks.current;
    const host = sessionStorage.getItem(`zoom-host-${code}`) === "true";
    const startMode = (sessionStorage.getItem(`zoom-mode-${code}`) as StartMode | null) || "video-off";
    // Browser session state is only available after hydration; initialize the room from that client state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsHost(host);
    setMode(startMode);
    setPreviewOpen(host && startMode === "video-on");
    setOwnName(sessionStorage.getItem(`zoom-name-${code}`) || "Vignesh V");
    setOwnParticipantId(Number(sessionStorage.getItem(`zoom-participant-${code}`)) || 0);
    const clientId = getClientId();
    clientIdRef.current = clientId;
    setClientId(clientId);
    let disposed = false;
    const iceServersReady = getMeetingIceServers(code, clientId)
      .then((config) => { if (!disposed && config.ice_servers.length) iceServers.current = config.ice_servers; })
      .catch(() => undefined);
    async function processSignal(signal: MeetingSignal) {
      let link = peerLinks.current.get(signal.from_client_id);
      if (!link) link = createPeerLink(signal.from_client_id);
      const pc = link.connection;
      if (signal.kind === "offer") {
        await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
        const queued = pendingCandidates.current.get(signal.from_client_id) ?? [];
        pendingCandidates.current.delete(signal.from_client_id);
        for (const candidate of queued) await pc.addIceCandidate(candidate);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendMeetingSignal(code, clientId, signal.from_client_id, "answer", answer);
      } else if (signal.kind === "answer") {
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
          const queued = pendingCandidates.current.get(signal.from_client_id) ?? [];
          pendingCandidates.current.delete(signal.from_client_id);
          for (const candidate of queued) await pc.addIceCandidate(candidate);
        }
      } else if (signal.kind === "ice") {
        const candidate = signal.payload as RTCIceCandidateInit;
        if (pc.remoteDescription) await pc.addIceCandidate(candidate);
        else pendingCandidates.current.set(signal.from_client_id, [...(pendingCandidates.current.get(signal.from_client_id) ?? []), candidate]);
      }
    }

    function createPeerLink(remoteClientId: string): PeerLink {
      const connection = new RTCPeerConnection({ iceServers: iceServers.current });
      const audioSender = connection.addTransceiver("audio", { direction: "sendrecv" }).sender;
      const videoSender = connection.addTransceiver("video", { direction: "sendrecv" }).sender;
      const link = { connection, audioSender, videoSender };
      peerLinks.current.set(remoteClientId, link);
      const streamForRemote = new MediaStream();
      connection.ontrack = (event) => {
        const stream = event.streams[0] ?? streamForRemote;
        if (!event.streams[0] && !stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
        setRemoteStreams((current) => ({ ...current, [remoteClientId]: stream }));
      };
      connection.onconnectionstatechange = () => {
        if (!disposed && connection.connectionState === "failed") {
          setError("A media connection failed. This network may require a TURN relay; ask the host to retry.");
        }
      };
      connection.onicecandidate = (event) => {
        if (event.candidate) void sendMeetingSignal(code, clientId, remoteClientId, "ice", event.candidate.toJSON()).catch(() => undefined);
      };
      syncLocalTracks();
      return link;
    }

    async function pollRoom() {
      if (disposed || polling.current) return;
      polling.current = true;
      try {
        await iceServersReady;
        const currentMeeting = await getMeeting(code);
        if (disposed) return;
        setMeeting(currentMeeting);
        if (currentMeeting.status === "ended") {
          for (const link of peerLinks.current.values()) link.connection.close();
          peerLinks.current.clear();
          mediaStream.current?.getTracks().forEach((track) => track.stop());
          mediaStream.current = null;
          setCameraOn(false);
          setRemoteStreams({});
          return;
        }
        const participants = currentMeeting.participants.filter((person) => person.client_id && person.client_id !== clientId);
        const participantIds = new Set(participants.map((person) => person.client_id as string));
        for (const [remoteId, link] of peerLinks.current) {
          if (!participantIds.has(remoteId)) {
            link.connection.close();
            peerLinks.current.delete(remoteId);
            setRemoteStreams((current) => { const next = { ...current }; delete next[remoteId]; return next; });
          }
        }
        for (const participant of participants) {
          const remoteId = participant.client_id as string;
          const link = peerLinks.current.get(remoteId) ?? createPeerLink(remoteId);
          if (clientId.localeCompare(remoteId) < 0 && link.connection.signalingState === "stable" && !link.connection.localDescription) {
            const offer = await link.connection.createOffer();
            await link.connection.setLocalDescription(offer);
            await sendMeetingSignal(code, clientId, remoteId, "offer", offer);
          }
        }
        const result = await getMeetingSignals(code, clientId, signalCursor.current);
        for (const signal of result.signals) {
          signalCursor.current = Math.max(signalCursor.current, signal.id);
          try { await processSignal(signal); }
          catch (cause) {
            console.error("WebRTC signal negotiation failed", cause);
            if (!disposed) setError("Couldn't negotiate a media connection. Please leave and rejoin the meeting.");
          }
        }
      } catch {
        // Keep an established call alive through brief signaling-service interruptions.
      } finally {
        polling.current = false;
      }
    }

    void pollRoom();
    const refreshTimer = window.setInterval(() => void pollRoom(), 1200);
    return () => {
      disposed = true;
      window.clearInterval(refreshTimer);
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      for (const link of effectPeerLinks.values()) link.connection.close();
      effectPeerLinks.clear();
    };
  }, [code]);

  async function enableCameraAndMic() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      mediaStream.current = stream;
      setMuted(false);
      setCameraOn(true);
      setPreviewOpen(false);
      if (selfVideo.current) selfVideo.current.srcObject = stream;
      syncLocalTracks();
    } catch {
      setError("Camera or microphone access was blocked. You can continue with both turned off.");
    }
  }

  async function startScreenShare() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const currentStream = mediaStream.current ?? new MediaStream();
      currentStream.getVideoTracks().forEach((track) => { track.stop(); currentStream.removeTrack(track); });
      stream.getVideoTracks().forEach((track) => currentStream.addTrack(track));
      mediaStream.current = currentStream;
      setCameraOn(true);
      setPreviewOpen(false);
      if (selfVideo.current) selfVideo.current.srcObject = currentStream;
      syncLocalTracks();
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stream.getVideoTracks().forEach((track) => { currentStream.removeTrack(track); });
        setCameraOn(false);
        syncLocalTracks();
      }, { once: true });
    } catch {
      setError("Screen sharing was cancelled or is unavailable in this browser.");
    }
  }

  async function toggleCamera() {
    if (cameraOn) {
      mediaStream.current?.getVideoTracks().forEach((track) => { track.stop(); mediaStream.current?.removeTrack(track); });
      setCameraOn(false);
      syncLocalTracks();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (mediaStream.current) stream.getTracks().forEach((track) => mediaStream.current?.addTrack(track));
      else mediaStream.current = stream;
      setCameraOn(true);
      if (selfVideo.current) selfVideo.current.srcObject = mediaStream.current;
      syncLocalTracks();
    } catch { setError("Camera access is unavailable. Check your browser permissions."); }
  }

  async function toggleMute() {
    // The Join Audio click is also the user gesture browsers require before
    // allowing remote audio playback on mobile.
    setAudioPlaybackEnabled(true);
    if (!muted) {
      mediaStream.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
      setMuted(true);
      return;
    }
    try {
      let audioTracks = mediaStream.current?.getAudioTracks() ?? [];
      if (!audioTracks.length) {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (mediaStream.current) audioStream.getTracks().forEach((track) => mediaStream.current?.addTrack(track));
        else mediaStream.current = audioStream;
        audioTracks = audioStream.getAudioTracks();
      }
      audioTracks.forEach((track) => { track.enabled = true; });
      syncLocalTracks();
      setMuted(false);
    } catch { setError("Microphone access is unavailable. Check your browser permissions."); }
  }

  async function exitMeeting() {
    setBusy(true); setError("");
    try {
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      if (isHost) { await endMeeting(code); sessionStorage.removeItem(`zoom-host-${code}`); }
      else { const id = Number(sessionStorage.getItem(`zoom-participant-${code}`)); if (id) await leaveMeeting(code, id); sessionStorage.removeItem(`zoom-participant-${code}`); sessionStorage.removeItem(`zoom-name-${code}`); }
      sessionStorage.removeItem(`zoom-mode-${code}`);
      router.push("/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't leave the meeting."); setBusy(false); }
  }

  const title = meeting?.title ?? "Zoom Meeting";
  const participantCount = Math.max(meeting?.participant_count ?? 0, meeting?.participants.length ?? 0, ownParticipantId || isHost ? 1 : 0);
  async function copyInviteLink() {
    const inviteUrl = `${window.location.origin}${meeting?.invite_path ?? `/join/${encodeURIComponent(code)}`}`;
    try { await navigator.clipboard.writeText(inviteUrl); setInviteCopied(true); window.setTimeout(() => setInviteCopied(false), 1800); }
    catch { setError(`Copy this invite link: ${inviteUrl}`); }
  }
  const otherParticipants = (meeting?.participants ?? []).filter((person) => person.client_id ? person.client_id !== clientId : person.id !== ownParticipantId);
  return <div className="zoom-room-app">
    <header className="room-appbar"><div className="room-workplace-brand"><Image src="/zoom-logo.svg" alt="Zoom" width={109} height={26} /><span /> <strong>Workplace</strong></div><nav><button>Discover Products <MeetingIcon name="caret" size={15} className="room-nav-caret" /></button><button>Pricing</button></nav><div className="room-appbar-right"><button>Admin Center</button><button className="room-download">Download</button><button className="room-upgrade">Upgrade</button><span className="room-user-avatar">V</span></div></header>
    <div className="room-layout">
      <aside className="room-sidebar" aria-label="Workspace navigation"><button><span className="room-sidebar-icon"><MeetingIcon name="home" /></span>Home</button><button><span className="room-sidebar-icon"><MeetingIcon name="chat" /></span>Chat</button><button className="selected"><span className="room-sidebar-icon"><MeetingIcon name="meeting" /></span>Meetings</button><button><span className="room-sidebar-icon"><MeetingIcon name="contacts" /></span>Contacts</button><button className="room-settings"><span className="room-sidebar-icon"><MeetingIcon name="settings" /></span>Settings</button></aside>
      <section className="room-workspace">
        <div className="room-titlebar"><button className="room-title-pill" onClick={() => setDetailsOpen(!detailsOpen)}><MeetingIcon name="info" size={18} /> {ownName}{isHost ? "’s Zoom Meeting" : "’s Meeting"}</button><div className="room-title-tools"><span title="Meeting security"><MeetingIcon name="security" size={19} /></span><span title="Effects"><MeetingIcon name="sparkles" size={20} /></span><span className="room-title-separator"/><span title="Apps"><MeetingIcon name="apps" size={18} /></span><span className="room-app-icon">zm</span></div></div>
        <div className="room-content">
          <div className="room-self-view" aria-label="Meeting video area">
            <div className={`room-video-grid${otherParticipants.length ? " has-remote" : ""}`}>
              <div className="room-video-tile local-video-tile">
                <video ref={selfVideo} autoPlay muted playsInline className={cameraOn ? "self-video visible" : "self-video"} />
                {!cameraOn && <div className="room-self-avatar">{ownName.charAt(0).toUpperCase()}</div>}
                <span className="room-self-name">{ownName}{isHost ? " (Host)" : " (You)"}</span>
              </div>
              {otherParticipants.map((person) => {
                const stream = person.client_id ? remoteStreams[person.client_id] : undefined;
                const hasVideo = stream?.getVideoTracks().some((track) => track.readyState === "live");
                return <div className="room-video-tile remote-video-tile" key={person.id}>
                  {stream && <StreamVideo stream={stream} audioEnabled={audioPlaybackEnabled} />}
                  {!hasVideo && <div className="room-self-avatar guest-avatar">{person.display_name.charAt(0).toUpperCase()}</div>}
                  <span className="room-self-name">{person.display_name}{person.role === "host" ? " (Host)" : ""}</span>
                </div>;
              })}
            </div>
          </div>
          {previewOpen && <div className="camera-preview-backdrop"><section className="camera-preview-card"><div className="preview-illustration"><span className="preview-camera-icon"><MeetingIcon name="video" size={27} /></span><div className="preview-person">V</div><span className="preview-people"><MeetingIcon name="participants" size={27} /></span></div><h1>Do you want people to see you in the meeting?</h1><p>You can still turn off your microphone and camera anytime in the meeting</p><button className="preview-enable" onClick={enableCameraAndMic}><MeetingIcon name="video" size={20} /> Use microphone and camera</button><button className="preview-continue" onClick={() => setPreviewOpen(false)}>Continue without microphone and camera</button></section></div>}
          {mode === "screen-share" && !previewOpen && !cameraOn && <div className="screen-share-prompt"><strong>Screen Share Only</strong><span>Share a window or your entire screen to begin.</span><button onClick={startScreenShare}>Share screen</button></div>}
          {detailsOpen && <aside className="room-details-popover"><button className="room-details-close" aria-label="Close meeting details" onClick={() => setDetailsOpen(false)}><MeetingIcon name="close" size={18} /></button><strong>{title}</strong><span>Meeting ID: {code}</span><span>{meeting ? formatMeetingTime(meeting.start_time) : "Loading…"}</span><span>{participantCount} participant{participantCount === 1 ? "" : "s"}</span><button className="room-invite-copy" onClick={copyInviteLink}>{inviteCopied ? "Invite link copied" : "Copy invite link"}</button></aside>}
        </div>
        <div className="zoom-meeting-toolbar">
          <div className="room-toolbar-left">
            <div className="room-control-group"><button className="zoom-control" onClick={toggleMute} aria-label={muted ? "Join audio" : "Mute microphone"}><span><MeetingIcon name="audio" muted={muted} /></span><small>{muted ? "Join Audio" : "Mute"}</small></button><button className="control-caret" aria-label="Audio settings" onClick={() => setError("Choose your microphone in browser site settings.")}><MeetingIcon name="caret" size={14} /></button></div>
            <div className="room-control-group"><button className="zoom-control" onClick={toggleCamera} aria-label={cameraOn ? "Stop video" : "Start video"}><span><MeetingIcon name="video" muted={!cameraOn} /></span><small>{cameraOn ? "Stop Video" : "Start Video"}</small></button><button className="control-caret" aria-label="Video settings" onClick={() => setError("Choose your camera in browser site settings.")}><MeetingIcon name="caret" size={14} /></button></div>
          </div>
          <div className="room-toolbar-center">
            <button className="zoom-control" onClick={() => setDetailsOpen(!detailsOpen)}><span><MeetingIcon name="participants" /></span><small>Participants <b>{participantCount}</b></small></button>
            <button className="zoom-control" onClick={() => setError("Meeting chat is a visual placeholder in this MVP.")}><span><MeetingIcon name="chat" /></span><small>Chat</small></button>
            <button className="zoom-control" onClick={() => setError("Reactions are a visual placeholder in this MVP.")}><span><MeetingIcon name="react" /></span><small>React</small></button>
            <button className="zoom-control" onClick={startScreenShare}><span><MeetingIcon name="share" /></span><small>Share</small></button>
            <button className="zoom-control" onClick={() => setError(isHost ? "Host controls are coming soon." : "Only the host can access host tools.")}><span><MeetingIcon name="host" /></span><small>Host tools</small></button>
            <button className="zoom-control" onClick={() => setError("More meeting controls are coming soon.")}><span><MeetingIcon name="more" /></span><small>More</small></button>
          </div>
          <button className="zoom-end-button" onClick={exitMeeting} disabled={busy}><span><MeetingIcon name="end" /></span><small>{busy ? "Leaving…" : isHost ? "End" : "Leave"}</small></button>
        </div>
      </section>
    </div>
    {error && <div className="room-message" role="status">{error}<button aria-label="Dismiss" onClick={() => setError("")}>×</button></div>}
  </div>;
}
