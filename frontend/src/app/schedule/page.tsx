"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { createMeeting, getClientId, MeetingConflictError } from "@/lib/api";

export default function SchedulePage() {
  const router = useRouter();
  const [title, setTitle] = useState("My Meeting");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(40);
  const [timezones, setTimezones] = useState<string[]>([]);
  const [timezone, setTimezone] = useState("");
  const [minimumDate, setMinimumDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const intlWithTimezones = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const availableTimezones = intlWithTimezones.supportedValuesOf?.("timeZone") ?? [detectedTimezone];
    if (detectedTimezone && !availableTimezones.includes(detectedTimezone)) availableTimezones.push(detectedTimezone);
    setTimezones(availableTimezones.sort((left, right) => left.localeCompare(right)));
    setTimezone(detectedTimezone || availableTimezones[0] || "");
    setMinimumDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10));
  }, []);

  function getScheduledInstantISO(): string {
    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
    let timestamp = desiredUtc;

    // Recalculate the UTC offset for the selected IANA zone, including DST.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(new Date(timestamp));
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      const representedUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute));
      timestamp = desiredUtc - (representedUtc - timestamp);
    }
    return new Date(timestamp).toISOString();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const meeting = await createMeeting({
        meeting_type: "scheduled",
        title: title.trim(),
        description: description.trim(),
        start_time: getScheduledInstantISO(),
        duration_minutes: duration,
        client_id: getClientId(),
      });
      router.push(`/?scheduled=${encodeURIComponent(meeting.meeting_code)}`);
    } catch (cause) {
      if (!(cause instanceof MeetingConflictError)) setError(cause instanceof Error ? cause.message : "Couldn't schedule the meeting.");
      setBusy(false);
    }
  }

  return <main className="schedule-page">
    <Link href="/" className="schedule-back"><span aria-hidden="true">‹</span> Back to Meetings</Link>
    <h1>Schedule Meeting</h1>
    <form onSubmit={submit} className="schedule-form">
      <div className="schedule-row">
        <label className="schedule-label" htmlFor="meeting-topic"><span className="required-mark">*</span> Topic</label>
        <div className="schedule-field topic-field"><input id="meeting-topic" required minLength={2} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></div>
      </div>

      <div className="schedule-row description-row">
        <span className="schedule-label" />
        <div className="schedule-field">
          {!showDescription ? <button type="button" className="add-description" onClick={() => setShowDescription(true)}><span>＋</span> Add Description</button> : <label className="schedule-description" htmlFor="meeting-description">Description <span className="optional">Optional</span><textarea id="meeting-description" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What would you like to discuss?" rows={3} /></label>}
        </div>
      </div>

      <div className="schedule-row">
        <label className="schedule-label" htmlFor="meeting-date">When</label>
        <div className="schedule-field schedule-controls date-time-controls">
          <input id="meeting-date" aria-label="Meeting date" required type="date" min={minimumDate} value={date} onChange={(event) => setDate(event.target.value)} />
          <input aria-label="Meeting time" required type="time" value={time} onChange={(event) => setTime(event.target.value)} />
        </div>
      </div>

      <div className="schedule-row">
        <label className="schedule-label" htmlFor="meeting-duration">Duration</label>
        <div className="schedule-field schedule-controls duration-controls">
          <select id="meeting-duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))} aria-label="Meeting duration">
            {[15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 105, 120, 135, 150, 165, 180].map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? `0 hr ${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60 ? `${minutes % 60} min` : ""}`}</option>)}
          </select>
          <span className="duration-caption">Meeting length (15–180 minutes)</span>
        </div>
      </div>

      <div className="schedule-row timezone-row">
        <span className="schedule-label">Time Zone</span>
        <div className="schedule-field"><select className="timezone-select" aria-label="Time zone" value={timezone} onChange={(event) => setTimezone(event.target.value)} disabled={!timezones.length} required><option value="" disabled>{timezones.length ? "Select a time zone" : "Loading time zones…"}</option>{timezones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</select><p className="field-hint">Meeting time will use the selected time zone.</p></div>
      </div>

      {error && <p className="inline-error schedule-error" role="alert">{error}</p>}
      <div className="schedule-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save"}</button><Link href="/" className="schedule-cancel">Cancel</Link></div>
    </form>
  </main>;
}
