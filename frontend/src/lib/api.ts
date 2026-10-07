const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  } catch {
    throw new Error("Can't reach the meeting service. Make sure the Python API is running.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong. Please try again.");
  return data as T;
}

export type Participant = { id: number; display_name: string; role: string };
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
export const createMeeting = (input: { meeting_type: "instant" | "scheduled"; title?: string; description?: string; start_time?: string; duration_minutes?: number }) =>
  request<Meeting>("/api/meetings", { method: "POST", body: JSON.stringify(input) });
export const joinMeeting = (code: string, display_name: string) =>
  request<{ participant_id: number; display_name: string; role: string }>(`/api/meetings/${encodeURIComponent(code)}/participants`, { method: "POST", body: JSON.stringify({ display_name }) });
export const leaveMeeting = (code: string, participant_id: number) =>
  request<{ status: string }>(`/api/meetings/${encodeURIComponent(code)}/leave`, { method: "POST", body: JSON.stringify({ participant_id }) });
export const endMeeting = (code: string) => request<{ status: string }>(`/api/meetings/${encodeURIComponent(code)}/end`, { method: "POST" });

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
