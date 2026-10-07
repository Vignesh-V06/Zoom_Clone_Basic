from __future__ import annotations

import secrets
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Generator

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


DATABASE_PATH = Path(__file__).with_name("zoom_clone.db")


def connect_db() -> sqlite3.Connection:
    # FastAPI may create a synchronous dependency and run a synchronous route
    # in different worker threads, so allow this request-scoped connection to
    # be used by the route worker after dependency setup.
    connection = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def get_db() -> Generator[sqlite3.Connection, None, None]:
    connection = connect_db()
    try:
        yield connection
    finally:
        connection.close()


class MeetingCreate(BaseModel):
    meeting_type: str = Field(pattern="^(instant|scheduled)$")
    title: str = Field(default="New meeting", min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    start_time: datetime | None = None
    duration_minutes: int = Field(default=40, ge=15, le=180)


class ParticipantCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)


class LeaveRequest(BaseModel):
    participant_id: int


app = FastAPI(title="Zoom Clone API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def new_code(db: sqlite3.Connection) -> str:
    while True:
        digits = f"{secrets.randbelow(1_000_000_000):09d}"
        code = f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
        exists = db.execute("SELECT 1 FROM meetings WHERE meeting_code = ?", (code,)).fetchone()
        if exists is None:
            return code


def find_meeting(db: sqlite3.Connection, code: str) -> sqlite3.Row:
    meeting = db.execute("SELECT * FROM meetings WHERE meeting_code = ?", (code,)).fetchone()
    if meeting is None:
        raise HTTPException(status_code=404, detail="We couldn't find that meeting. Check the ID and try again.")
    return meeting


def meeting_json(db: sqlite3.Connection, meeting: sqlite3.Row) -> dict:
    host = db.execute("SELECT display_name FROM users WHERE id = ?", (meeting["host_id"],)).fetchone()
    people = db.execute(
        "SELECT id, display_name, role FROM participants WHERE meeting_id = ? AND left_at IS NULL ORDER BY joined_at",
        (meeting["id"],),
    ).fetchall()
    return {
        "id": meeting["id"],
        "meeting_code": meeting["meeting_code"],
        "title": meeting["title"],
        "description": meeting["description"],
        "meeting_type": meeting["meeting_type"],
        "is_personal": bool(meeting["is_personal"]),
        "start_time": meeting["start_time"],
        "duration_minutes": meeting["duration_minutes"],
        "status": meeting["status"],
        "host_name": host["display_name"],
        "participant_count": len(people),
        "participants": [dict(person) for person in people],
        "invite_path": f"/join/{meeting['meeting_code']}",
    }


def seed_database() -> None:
    with closing(connect_db()) as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                display_name TEXT NOT NULL,
                personal_meeting_code TEXT UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS meetings (
                id INTEGER PRIMARY KEY,
                meeting_code TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                host_id INTEGER NOT NULL REFERENCES users(id),
                meeting_type TEXT NOT NULL CHECK (meeting_type IN ('instant', 'scheduled')),
                start_time TEXT NOT NULL,
                duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 15 AND 180),
                status TEXT NOT NULL CHECK (status IN ('scheduled', 'active', 'ended')),
                is_personal INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS participants (
                id INTEGER PRIMARY KEY,
                meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('host', 'participant')),
                joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                left_at TEXT
            );
            CREATE INDEX IF NOT EXISTS ix_meetings_start_time ON meetings(start_time);
            CREATE INDEX IF NOT EXISTS ix_participants_meeting_id ON participants(meeting_id);
            """
        )
        user_columns = {column["name"] for column in db.execute("PRAGMA table_info(users)").fetchall()}
        if "personal_meeting_code" not in user_columns:
            db.execute("ALTER TABLE users ADD COLUMN personal_meeting_code TEXT")
        meeting_columns = {column["name"] for column in db.execute("PRAGMA table_info(meetings)").fetchall()}
        if "is_personal" not in meeting_columns:
            db.execute("ALTER TABLE meetings ADD COLUMN is_personal INTEGER NOT NULL DEFAULT 0")

        host = db.execute("SELECT id, display_name, personal_meeting_code FROM users ORDER BY id LIMIT 1").fetchone()
        if host is None:
            cursor = db.execute("INSERT INTO users (display_name) VALUES (?)", ("Vignesh V",))
            host_id = cursor.lastrowid
            host = db.execute("SELECT id, display_name, personal_meeting_code FROM users WHERE id = ?", (host_id,)).fetchone()
        else:
            host_id = host["id"]

        personal_code = host["personal_meeting_code"]
        if not personal_code:
            while True:
                digits = f"{secrets.randbelow(10_000_000_000):010d}"
                candidate = f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
                occupied = db.execute("SELECT 1 FROM meetings WHERE meeting_code = ?", (candidate,)).fetchone()
                if occupied is None:
                    personal_code = candidate
                    break
            db.execute("UPDATE users SET personal_meeting_code = ? WHERE id = ?", (personal_code, host_id))

        personal_room = db.execute("SELECT id FROM meetings WHERE meeting_code = ?", (personal_code,)).fetchone()
        if personal_room is None:
            db.execute(
                """INSERT INTO meetings
                   (meeting_code, title, description, host_id, meeting_type, start_time, duration_minutes, status, is_personal)
                   VALUES (?, ?, ?, ?, 'instant', ?, 40, 'active', 1)""",
                (personal_code, f"{host['display_name']}'s Personal Room", "Personal meeting room", host_id, utc_now().isoformat()),
            )
        else:
            db.execute("UPDATE meetings SET is_personal = 1 WHERE meeting_code = ?", (personal_code,))

        count = db.execute("SELECT COUNT(*) AS count FROM meetings WHERE is_personal = 0").fetchone()["count"]
        if count == 0:
            now = utc_now()
            samples = [
                ("381-204-916", "Product design sync", "Review the latest product updates.", "scheduled", now + timedelta(hours=1), 40),
                ("726-510-384", "Weekly team catch-up", "A quick team check-in.", "scheduled", now + timedelta(days=1), 30),
                ("591-038-447", "Planning discussion", "Project planning notes.", "ended", now - timedelta(days=1), 40),
                ("064-829-135", "Design review", "A previous design review.", "ended", now - timedelta(days=2), 30),
            ]
            for code, title, description, meeting_status, start_time, duration in samples:
                cursor = db.execute(
                    """INSERT INTO meetings
                       (meeting_code, title, description, host_id, meeting_type, start_time, duration_minutes, status)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (code, title, description, host_id, "scheduled" if meeting_status == "scheduled" else "instant", start_time.isoformat(), duration, meeting_status),
                )
                if meeting_status == "ended":
                    db.execute(
                        "INSERT INTO participants (meeting_id, display_name, role, joined_at) VALUES (?, ?, ?, ?)",
                        (cursor.lastrowid, "Vignesh V", "host", start_time.isoformat()),
                    )
        db.commit()


@app.on_event("startup")
def on_startup() -> None:
    seed_database()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/profile")
def get_profile(db: sqlite3.Connection = Depends(get_db)) -> dict[str, str]:
    host = db.execute("SELECT display_name, personal_meeting_code FROM users ORDER BY id LIMIT 1").fetchone()
    if host is None or not host["personal_meeting_code"]:
        raise HTTPException(status_code=503, detail="The default profile is not ready yet.")
    return {"display_name": host["display_name"], "personal_meeting_code": host["personal_meeting_code"]}


@app.get("/api/meetings")
def list_meetings(db: sqlite3.Connection = Depends(get_db)) -> dict:
    now = utc_now().isoformat()
    upcoming = db.execute(
        "SELECT * FROM meetings WHERE is_personal = 0 AND status = 'scheduled' AND start_time >= ? ORDER BY start_time ASC LIMIT 6", (now,)
    ).fetchall()
    recent = db.execute(
        "SELECT * FROM meetings WHERE is_personal = 0 AND status IN ('ended', 'active') ORDER BY start_time DESC LIMIT 6"
    ).fetchall()
    return {"upcoming": [meeting_json(db, row) for row in upcoming], "recent": [meeting_json(db, row) for row in recent]}


@app.post("/api/meetings", status_code=status.HTTP_201_CREATED)
def create_meeting(payload: MeetingCreate, db: sqlite3.Connection = Depends(get_db)) -> dict:
    host = db.execute("SELECT id, display_name FROM users ORDER BY id LIMIT 1").fetchone()
    if host is None:
        cursor = db.execute("INSERT INTO users (display_name) VALUES (?)", ("Vignesh V",))
        host = db.execute("SELECT id, display_name FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()

    if payload.meeting_type == "scheduled":
        if payload.start_time is None:
            raise HTTPException(status_code=422, detail="Choose a date and time for the meeting.")
        start_time = payload.start_time
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        if start_time <= utc_now():
            raise HTTPException(status_code=422, detail="Choose a future date and time.")
        meeting_status = "scheduled"
    else:
        start_time = utc_now()
        meeting_status = "active"

    code = new_code(db)
    cursor = db.execute(
        """INSERT INTO meetings
           (meeting_code, title, description, host_id, meeting_type, start_time, duration_minutes, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (code, payload.title.strip() or "New meeting", payload.description.strip(), host["id"], payload.meeting_type,
         start_time.astimezone(timezone.utc).isoformat(), payload.duration_minutes, meeting_status),
    )
    meeting_id = cursor.lastrowid
    if payload.meeting_type == "instant":
        db.execute("INSERT INTO participants (meeting_id, display_name, role) VALUES (?, ?, 'host')", (meeting_id, host["display_name"]))
    db.commit()
    return meeting_json(db, find_meeting(db, code))


@app.get("/api/meetings/{meeting_code}")
def get_meeting(meeting_code: str, db: sqlite3.Connection = Depends(get_db)) -> dict:
    return meeting_json(db, find_meeting(db, meeting_code))


@app.post("/api/meetings/{meeting_code}/participants", status_code=status.HTTP_201_CREATED)
def join_meeting(meeting_code: str, payload: ParticipantCreate, db: sqlite3.Connection = Depends(get_db)) -> dict:
    meeting = find_meeting(db, meeting_code)
    if meeting["status"] == "ended":
        raise HTTPException(status_code=409, detail="This meeting has ended.")
    cursor = db.execute(
        "INSERT INTO participants (meeting_id, display_name, role) VALUES (?, ?, 'participant')",
        (meeting["id"], payload.display_name.strip()),
    )
    db.commit()
    return {"participant_id": cursor.lastrowid, "display_name": payload.display_name.strip(), "role": "participant"}


@app.post("/api/meetings/{meeting_code}/leave")
def leave_meeting(meeting_code: str, payload: LeaveRequest, db: sqlite3.Connection = Depends(get_db)) -> dict[str, str]:
    meeting = find_meeting(db, meeting_code)
    participant = db.execute("SELECT id FROM participants WHERE id = ? AND meeting_id = ?", (payload.participant_id, meeting["id"])).fetchone()
    if participant is None:
        raise HTTPException(status_code=404, detail="Participant not found in this meeting.")
    db.execute("UPDATE participants SET left_at = ? WHERE id = ?", (utc_now().isoformat(), payload.participant_id))
    db.commit()
    return {"status": "left"}


@app.post("/api/meetings/{meeting_code}/end")
def end_meeting(meeting_code: str, db: sqlite3.Connection = Depends(get_db)) -> dict[str, str]:
    meeting = find_meeting(db, meeting_code)
    db.execute("UPDATE meetings SET status = 'ended' WHERE id = ?", (meeting["id"],))
    db.execute("UPDATE participants SET left_at = ? WHERE meeting_id = ? AND left_at IS NULL", (utc_now().isoformat(), meeting["id"]))
    db.commit()
    return {"status": "ended"}
