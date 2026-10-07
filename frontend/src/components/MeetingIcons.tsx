import type { ReactNode, SVGProps } from "react";

type IconName = "info" | "security" | "sparkles" | "apps" | "home" | "chat" | "meeting" | "contacts" | "settings" | "audio" | "video" | "participants" | "react" | "share" | "host" | "more" | "end" | "caret" | "close";

export function MeetingIcon({ name, size = 24, muted = false, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number; muted?: boolean }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, ReactNode> = {
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></>,
    security: <path d="M12 3 19 6v5c0 4.6-3 8-7 10-4-2-7-5.4-7-10V6l7-3Z"/>,
    sparkles: <><path d="m12 3 1.3 5.7L19 11l-5.7 1.3L12 18l-1.3-5.7L5 11l5.7-2.3L12 3Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/></>,
    apps: <><rect x="4" y="4" width="5" height="5" rx=".8"/><rect x="15" y="4" width="5" height="5" rx=".8"/><rect x="4" y="15" width="5" height="5" rx=".8"/><rect x="15" y="15" width="5" height="5" rx=".8"/></>,
    home: <><path d="m3.5 10 8.5-7 8.5 7"/><path d="M5.5 9v11h13V9M10 20v-6h4v6"/></>,
    chat: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4.2A2.5 2.5 0 0 1 4 12.5v-7Z"/><path d="M8 8h8m-8 4h5"/></>,
    meeting: <><rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3"/></>,
    contacts: <><rect x="4" y="3" width="16" height="18" rx="2.5"/><circle cx="12" cy="9" r="3"/><path d="M7.5 18a4.5 4.5 0 0 1 9 0"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 3.1-.2-.1a1.7 1.7 0 0 0-1.9.3l-.1.1h-3.6l-.1-.2a1.7 1.7 0 0 0-1.5-1.1h-.2l-3.1-1.8.1-.2a1.7 1.7 0 0 0-.3-1.9l-.1-.1v-3.6l.2-.1a1.7 1.7 0 0 0 1.1-1.5v-.2l1.8-3.1.2.1a1.7 1.7 0 0 0 1.9-.3l.1-.1h3.6l.1.2a1.7 1.7 0 0 0 1.5 1.1h.2l3.1 1.8-.1.2a1.7 1.7 0 0 0 .3 1.9l.1.1v3.6Z"/></>,
    audio: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8"/>{muted && <path d="m4 4 16 16" stroke="var(--icon-alert,#ef5350)" strokeWidth="2.1"/>}</>,
    video: <><rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3"/>{muted && <path d="m4 4 16 16" stroke="var(--icon-alert,#ef5350)" strokeWidth="2.1"/>}</>,
    participants: <><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 4.8"/></>,
    react: <path d="M20.8 8.8c0 5.4-8.8 11-8.8 11s-8.8-5.6-8.8-11a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2Z"/>,
    share: <><rect x="3" y="10" width="18" height="11" rx="2"/><path d="M12 15V3m-4 4 4-4 4 4"/></>,
    host: <><path d="M12 2.8 20 6v5.4c0 4.8-3.3 8-8 9.8-4.7-1.8-8-5-8-9.8V6l8-3.2Z"/><path d="m8.5 12 2.3 2.3 4.8-5"/></>,
    more: <><circle cx="12" cy="12" r="9"/><circle cx="7.5" cy="12" r=".7" fill="currentColor"/><circle cx="12" cy="12" r=".7" fill="currentColor"/><circle cx="16.5" cy="12" r=".7" fill="currentColor"/></>,
    end: <><path d="M7 2.8h10l4.2 4.2v10L17 21.2H7L2.8 17V7L7 2.8Z"/><path d="m9 9 6 6m0-6-6 6"/></>,
    caret: <path d="m6 14 6-6 6 6"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
  };
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" {...common} {...props}>{paths[name]}</svg>;
}
