import type { Metadata, Viewport } from "next";
import Header from "@/components/Header";
import MeetingConflictDialog from "@/components/MeetingConflictDialog";
import "./globals.css";

export const metadata: Metadata = { title: "Zoom | Video meetings", description: "Schedule and join video meetings." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Header /><main>{children}</main><MeetingConflictDialog /></body></html>;
}
