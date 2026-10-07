"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createMeeting } from "@/lib/api";
import { ChevronDownIcon } from "@/components/DashboardIcons";

export default function Header() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");
  async function hostNow() {
    setStarting(true); setMessage("");
    try {
      const meeting = await createMeeting({ meeting_type: "instant", title: "New meeting" });
      sessionStorage.setItem(`zoom-host-${meeting.meeting_code}`, "true");
      router.push(`/meeting/${encodeURIComponent(meeting.meeting_code)}`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Couldn't start the meeting."); setStarting(false); }
  }
  return <>
    <header className="topbar">
      <Link href="/" className="brand" aria-label="Zoom home">
        <img src="/zoom-logo.svg" alt="Zoom" width="137" height="32" />
      </Link>
      <nav className="topnav" aria-label="Main navigation">
        <Link href="/schedule">Schedule</Link><Link href="/join">Join</Link>
        <button className="nav-host" onClick={hostNow} disabled={starting}>{starting ? "Starting…" : "Host"}<ChevronDownIcon /></button>
        <button className="web-app" onClick={() => setMessage("Web App settings are a visual placeholder in this MVP.")}>Web App <ChevronDownIcon /></button>
      </nav>
      <div className="profile-wrap"><button className="avatar" aria-label="Open profile menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>V</button>
        {menuOpen && <div className="profile-menu"><div className="profile-summary"><div className="avatar small">V</div><div><strong>Vignesh V</strong><span>Default account</span></div></div><div className="menu-divider" />
          {["Profile", "Settings", "Plans and billing", "Help", "Add account", "Sign out"].map((item) => <button key={item} onClick={() => { setMenuOpen(false); setMessage(`${item} is a placeholder for this assignment.`); }}>{item}</button>)}
        </div>}
      </div>
    </header>
    {message && <div className="toast" role="status">{message}<button aria-label="Dismiss" onClick={() => setMessage("")}>×</button></div>}
  </>;
}
