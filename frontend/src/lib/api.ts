const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class MeetingConflictError extends Error {
  constructor(message: string) { super(message); this.name = "MeetingConflictError"; }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  } catch {
    throw new Error("Can't reach the meeting service. Make sure the Python API is running.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail;
    if (response.status === 409 && detail && typeof detail === "object" && typeof detail.meeting_code === "string") {
      const message = detail.message || "You are already in another meeting.";
      if (typeof window === "undefined") throw new MeetingConflictError(message);
      return await new Promise<T>((resolve, reject) => {
        window.dispatchEvent(new CustomEvent("zoom-meeting-conflict", {
          detail: {
            ...detail,
            retry: () => request<T>(path, init).then(resolve, reject),
            cancel: () => reject(new MeetingConflictError(message)),
          },
        }));
      });
    }
    throw new Error(typeof detail === "string" ? detail : "Something went wrong. Please try again.");
  }
  return data as T;
}

export type Participant = { id: number; display_name: string; role: string; client_id: string | null };
export type MeetingSignal = { id: number; from_client_id: string; to_client_id: string; kind: "offer" | "answer" | "ice"; payload: RTCSessionDescriptionInit | RTCIceCandidateInit };
export type Meeting = {
  id: number; meeting_code: string; title: string; description: string;
  meeting_type: "instant" | "scheduled"; start_time: string; duration_minutes: number;
  status: "scheduled" | "active" | "ended"; host_name: string; is_personal: boolean; participant_count: number;
  participants: Participant[]; invite_path: string;
};
export type DashboardData = { upcoming: Meeting[]; recent: Meeting[] };
export type Profile = { display_name: string; personal_meeting_code: string };

export const getDashboard = () => request<DashboardData>("/api/meetings");
export const getProfile = () => request<Profile>("/api/profile");
export const getMeeting = (code: string) => request<Meeting>(`/api/meetings/${encodeURIComponent(code)}`);
export const createMeeting = (input: { meeting_type: "instant" | "scheduled"; title?: string; description?: string; start_time?: string; duration_minutes?: number; client_id?: string }) =>
  request<Meeting>("/api/meetings", { method: "POST", body: JSON.stringify(input) });
export const joinMeeting = (code: string, display_name: string, client_id?: string) =>
  request<{ participant_id: number; display_name: string; role: string }>(`/api/meetings/${encodeURIComponent(code)}/participants`, { method: "POST", body: JSON.stringify({ display_name, client_id }) });
export const leaveMeeting = (code: string, participant_id: number) =>
  request<{ status: string }>(`/api/meetings/${encodeURIComponent(code)}/leave`, { method: "POST", body: JSON.stringify({ participant_id }) });
export const endMeeting = (code: string) => request<{ status: string }>(`/api/meetings/${encodeURIComponent(code)}/end`, { method: "POST" });
export const getMeetingSignals = (code: string, client_id: string, after_id: number) =>
  request<{ signals: MeetingSignal[] }>(`/api/meetings/${encodeURIComponent(code)}/signals?client_id=${encodeURIComponent(client_id)}&after_id=${after_id}`);
export const sendMeetingSignal = (code: string, from_client_id: string, to_client_id: string, kind: MeetingSignal["kind"], payload: RTCSessionDescriptionInit | RTCIceCandidateInit) =>
  request<{ signal_id: number }>(`/api/meetings/${encodeURIComponent(code)}/signals`, { method: "POST", body: JSON.stringify({ from_client_id, to_client_id, kind, payload }) });

export function getClientId(): string {
  let clientId = localStorage.getItem("zoom-client-id");
  if (!clientId) {
    clientId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `zoom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("zoom-client-id", clientId);
  }
  return clientId;
}

export function normalizeMeetingCode(value: string): string {
  const lastPart = value.trim().replace(/\/+$/, "").split("/").pop() ?? "";
  const digits = lastPart.replace(/\D/g, "");
  if (digits.length === 9) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return lastPart;
}
export function formatMeetingTime(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
