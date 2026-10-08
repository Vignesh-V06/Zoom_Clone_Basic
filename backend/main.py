from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import sqlite3
import json
import os
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Generator, Literal

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


DATABASE_PATH = Path(os.getenv("DATABASE_PATH", str(Path(__file__).with_name("zoom_clone.db"))))


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
    client_id: str | None = Field(default=None, min_length=8, max_length=100)
    device_id: str | None = Field(default=None, min_length=8, max_length=100)


class ParticipantCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    client_id: str | None = Field(default=None, min_length=8, max_length=100)
    device_id: str | None = Field(default=None, min_length=8, max_length=100)


class LeaveRequest(BaseModel):
    participant_id: int


class SignalCreate(BaseModel):
    from_client_id: str = Field(min_length=8, max_length=100)
    to_client_id: str = Field(min_length=8, max_length=100)
    kind: Literal["offer", "answer", "ice"]
    payload: dict


app = FastAPI(title="Zoom Clone API", version="1.0.0")
frontend_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:3000,https://zoom-clone-basic.vercel.app",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
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
        "SELECT id, display_name, role, client_id FROM participants WHERE meeting_id = ? AND left_at IS NULL ORDER BY joined_at",
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


def expire_finished_meetings(db: sqlite3.Connection) -> None:
    """Close non-personal rooms whose scheduled duration has elapsed."""
    now = utc_now().isoformat()
    expired = db.execute(
        """SELECT id FROM meetings WHERE status = 'active' AND is_personal = 0
           AND datetime(start_time, '+' || duration_minutes || ' minutes') <= datetime(?)""",
        (now,),
    ).fetchall()
    if not expired:
        return
    ids = [row["id"] for row in expired]
    placeholders = ",".join("?" for _ in ids)
    db.execute(f"UPDATE meetings SET status = 'ended' WHERE id IN ({placeholders})", ids)
    db.execute(f"UPDATE participants SET left_at = ? WHERE meeting_id IN ({placeholders}) AND left_at IS NULL", [now, *ids])
    db.execute(f"DELETE FROM meeting_signals WHERE meeting_id IN ({placeholders})", ids)
    db.commit()


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
                host_client_id TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS participants (
                id INTEGER PRIMARY KEY,
                meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('host', 'participant')),
                joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                left_at TEXT,
                client_id TEXT,
                device_id TEXT
            );
            CREATE INDEX IF NOT EXISTS ix_meetings_start_time ON meetings(start_time);
            CREATE INDEX IF NOT EXISTS ix_participants_meeting_id ON participants(meeting_id);
            CREATE TABLE IF NOT EXISTS meeting_signals (
                id INTEGER PRIMARY KEY,
                meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                from_client_id TEXT NOT NULL,
                to_client_id TEXT NOT NULL,
                kind TEXT NOT NULL CHECK (kind IN ('offer', 'answer', 'ice')),
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS ix_meeting_signals_recipient ON meeting_signals(meeting_id, to_client_id, id);
            """
        )
        user_columns = {column["name"] for column in db.execute("PRAGMA table_info(users)").fetchall()}
        if "personal_meeting_code" not in user_columns:
            db.execute("ALTER TABLE users ADD COLUMN personal_meeting_code TEXT")
        meeting_columns = {column["name"] for column in db.execute("PRAGMA table_info(meetings)").fetchall()}
        if "is_personal" not in meeting_columns:
            db.execute("ALTER TABLE meetings ADD COLUMN is_personal INTEGER NOT NULL DEFAULT 0")
        if "host_client_id" not in meeting_columns:
            db.execute("ALTER TABLE meetings ADD COLUMN host_client_id TEXT")
        participant_columns = {column["name"] for column in db.execute("PRAGMA table_info(participants)").fetchall()}
        if "client_id" not in participant_columns:
            db.execute("ALTER TABLE participants ADD COLUMN client_id TEXT")
        if "device_id" not in participant_columns:
            db.execute("ALTER TABLE participants ADD COLUMN device_id TEXT")
        db.execute("CREATE INDEX IF NOT EXISTS ix_participants_client_active ON participants(client_id, left_at)")

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
    expire_finished_meetings(db)
    now = utc_now().isoformat()
    # Keep scheduled meetings visible through their full duration after the start
    # time, and keep a live meeting in the Upcoming card while it is in progress.
    upcoming = db.execute(
        """SELECT * FROM meetings WHERE is_personal = 0 AND (
               (status = 'scheduled' AND datetime(start_time, '+' || duration_minutes || ' minutes') > datetime(?))
               OR (status = 'active' AND datetime(start_time, '+' || duration_minutes || ' minutes') > datetime(?))
           ) ORDER BY start_time ASC LIMIT 6""",
        (now, now),
    ).fetchall()
    recent = db.execute(
        "SELECT * FROM meetings WHERE is_personal = 0 AND status = 'ended' ORDER BY start_time DESC LIMIT 6"
    ).fetchall()
    return {"upcoming": [meeting_json(db, row) for row in upcoming], "recent": [meeting_json(db, row) for row in recent]}


@app.post("/api/meetings", status_code=status.HTTP_201_CREATED)
def create_meeting(payload: MeetingCreate, db: sqlite3.Connection = Depends(get_db)) -> dict:
    expire_finished_meetings(db)
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
        if payload.client_id or payload.device_id:
            occupied = db.execute(
                """SELECT m.title, m.meeting_code FROM participants p JOIN meetings m ON m.id = p.meeting_id
                   WHERE (p.device_id = ? OR p.client_id = ?) AND p.left_at IS NULL AND m.status = 'active'
                     AND datetime(m.start_time, '+' || m.duration_minutes || ' minutes') > datetime(?)
                     AND datetime(?) < datetime(m.start_time, '+' || m.duration_minutes || ' minutes') LIMIT 1""",
                (payload.device_id or payload.client_id, payload.client_id, utc_now().isoformat(), start_time.isoformat()),
            ).fetchone()
            if occupied:
                raise HTTPException(status_code=409, detail={"message": f"You are currently in '{occupied['title']}'. Leave that meeting before scheduling another one.", "meeting_code": occupied["meeting_code"], "title": occupied["title"]})
        meeting_status = "scheduled"
    else:
        if payload.client_id or payload.device_id:
            occupied = db.execute(
                """SELECT m.title, m.meeting_code FROM participants p JOIN meetings m ON m.id = p.meeting_id
                   WHERE (p.device_id = ? OR p.client_id = ?) AND p.left_at IS NULL AND m.status = 'active' LIMIT 1""",
                (payload.device_id or payload.client_id, payload.client_id),
            ).fetchone()
            if occupied:
                raise HTTPException(status_code=409, detail={"message": f"You are currently in '{occupied['title']}'. End or leave that meeting before starting another one.", "meeting_code": occupied["meeting_code"], "title": occupied["title"]})
        start_time = utc_now()
        meeting_status = "active"

    code = new_code(db)
    cursor = db.execute(
        """INSERT INTO meetings
           (meeting_code, title, description, host_id, meeting_type, start_time, duration_minutes, status, host_client_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (code, payload.title.strip() or "New meeting", payload.description.strip(), host["id"], payload.meeting_type,
         start_time.astimezone(timezone.utc).isoformat(), payload.duration_minutes, meeting_status, payload.client_id),
    )
    meeting_id = cursor.lastrowid
    if payload.meeting_type == "instant":
        db.execute("INSERT INTO participants (meeting_id, display_name, role, client_id, device_id) VALUES (?, ?, 'host', ?, ?)", (meeting_id, host["display_name"], payload.client_id, payload.device_id))
    db.commit()
    return meeting_json(db, find_meeting(db, code))


@app.get("/api/meetings/{meeting_code}")
def get_meeting(meeting_code: str, db: sqlite3.Connection = Depends(get_db)) -> dict:
    expire_finished_meetings(db)
    return meeting_json(db, find_meeting(db, meeting_code))


@app.post("/api/meetings/{meeting_code}/participants", status_code=status.HTTP_201_CREATED)
def join_meeting(meeting_code: str, payload: ParticipantCreate, db: sqlite3.Connection = Depends(get_db)) -> dict:
    expire_finished_meetings(db)
    meeting = find_meeting(db, meeting_code)
    if meeting["status"] == "ended":
        raise HTTPException(status_code=409, detail="This meeting has ended.")
    if payload.client_id:
        already_in_this_meeting = db.execute(
            "SELECT id, display_name, role FROM participants WHERE client_id = ? AND meeting_id = ? AND left_at IS NULL ORDER BY id LIMIT 1",
            (payload.client_id, meeting["id"]),
        ).fetchone()
        if already_in_this_meeting:
            return {"participant_id": already_in_this_meeting["id"], "display_name": already_in_this_meeting["display_name"], "role": already_in_this_meeting["role"]}
        occupied = db.execute(
            """SELECT m.title, m.meeting_code FROM participants p JOIN meetings m ON m.id = p.meeting_id
               WHERE (p.device_id = ? OR p.client_id = ?) AND p.left_at IS NULL AND m.status = 'active' AND m.id != ? LIMIT 1""",
            (payload.device_id or payload.client_id, payload.client_id, meeting["id"]),
        ).fetchone()
        if occupied:
            raise HTTPException(status_code=409, detail={"message": f"You are currently in '{occupied['title']}'. Leave that meeting before joining another one.", "meeting_code": occupied["meeting_code"], "title": occupied["title"]})
    role = "host" if payload.client_id and meeting["host_client_id"] == payload.client_id else "participant"
    cursor = db.execute(
        "INSERT INTO participants (meeting_id, display_name, role, client_id, device_id) VALUES (?, ?, ?, ?, ?)",
        (meeting["id"], payload.display_name.strip(), role, payload.client_id, payload.device_id),
    )
    db.execute("UPDATE meetings SET status = 'active' WHERE id = ? AND status = 'scheduled'", (meeting["id"],))
    db.commit()
    return {"participant_id": cursor.lastrowid, "display_name": payload.display_name.strip(), "role": role}


@app.post("/api/meetings/{meeting_code}/leave")
def leave_meeting(meeting_code: str, payload: LeaveRequest, db: sqlite3.Connection = Depends(get_db)) -> dict[str, str]:
    meeting = find_meeting(db, meeting_code)
    participant = db.execute("SELECT id, client_id FROM participants WHERE id = ? AND meeting_id = ?", (payload.participant_id, meeting["id"])).fetchone()
    if participant is None:
        raise HTTPException(status_code=404, detail="Participant not found in this meeting.")
    db.execute("UPDATE participants SET left_at = ? WHERE id = ?", (utc_now().isoformat(), payload.participant_id))
    if participant["client_id"]:
        db.execute("DELETE FROM meeting_signals WHERE meeting_id = ? AND (from_client_id = ? OR to_client_id = ?)", (meeting["id"], participant["client_id"], participant["client_id"]))
    db.commit()
    return {"status": "left"}


@app.post("/api/meetings/{meeting_code}/signals", status_code=status.HTTP_201_CREATED)
def create_meeting_signal(meeting_code: str, payload: SignalCreate, db: sqlite3.Connection = Depends(get_db)) -> dict[str, int]:
    meeting = find_meeting(db, meeting_code)
    if meeting["status"] == "ended":
        raise HTTPException(status_code=409, detail="This meeting has ended.")
    active_clients = {
        row["client_id"] for row in db.execute(
            "SELECT client_id FROM participants WHERE meeting_id = ? AND left_at IS NULL AND client_id IN (?, ?)",
            (meeting["id"], payload.from_client_id, payload.to_client_id),
        ).fetchall()
    }
    if payload.from_client_id not in active_clients or payload.to_client_id not in active_clients:
        raise HTTPException(status_code=403, detail="Both participants must be in the meeting to exchange media.")
    cursor = db.execute(
        "INSERT INTO meeting_signals (meeting_id, from_client_id, to_client_id, kind, payload) VALUES (?, ?, ?, ?, ?)",
        (meeting["id"], payload.from_client_id, payload.to_client_id, payload.kind, json.dumps(payload.payload)),
    )
    db.commit()
    return {"signal_id": cursor.lastrowid}


@app.get("/api/meetings/{meeting_code}/signals")
def get_meeting_signals(meeting_code: str, client_id: str, after_id: int = 0, db: sqlite3.Connection = Depends(get_db)) -> dict:
    meeting = find_meeting(db, meeting_code)
    participant = db.execute(
        "SELECT 1 FROM participants WHERE meeting_id = ? AND client_id = ? AND left_at IS NULL LIMIT 1",
        (meeting["id"], client_id),
    ).fetchone()
    if participant is None:
        raise HTTPException(status_code=403, detail="Join the meeting before receiving media signals.")
    signals = db.execute(
        """SELECT id, from_client_id, to_client_id, kind, payload FROM meeting_signals
           WHERE meeting_id = ? AND to_client_id = ? AND id > ? ORDER BY id LIMIT 100""",
        (meeting["id"], client_id, after_id),
    ).fetchall()
    return {"signals": [{**dict(signal), "payload": json.loads(signal["payload"])} for signal in signals]}


@app.get("/api/meetings/{meeting_code}/ice-servers")
def get_meeting_ice_servers(meeting_code: str, client_id: str, db: sqlite3.Connection = Depends(get_db)) -> dict:
    """Return ICE servers only to a participant in this meeting.

    TURN can use coturn REST shared-secret auth so each participant receives
    a short-lived credential instead of a permanent shared password.
    """
    meeting = find_meeting(db, meeting_code)
    participant = db.execute(
        "SELECT 1 FROM participants WHERE meeting_id = ? AND client_id = ? AND left_at IS NULL LIMIT 1",
        (meeting["id"], client_id),
    ).fetchone()
    if participant is None:
        raise HTTPException(status_code=403, detail="Join the meeting before requesting media servers.")

    ice_servers: list[dict] = [{"urls": "stun:stun.l.google.com:19302"}]
    turn_urls = [value.strip() for value in os.getenv("TURN_URLS", "").split(",") if value.strip()]
    if turn_urls:
        turn_server: dict = {"urls": turn_urls}
        shared_secret = os.getenv("TURN_SHARED_SECRET", "")
        static_username = os.getenv("TURN_USERNAME", "")
        static_credential = os.getenv("TURN_CREDENTIAL", "")
        if shared_secret:
            expires_at = int(utc_now().timestamp()) + 3600
            username = f"{expires_at}:{client_id}"
            credential = base64.b64encode(
                hmac.new(shared_secret.encode(), username.encode(), hashlib.sha1).digest()
            ).decode()
            turn_server.update({"username": username, "credential": credential})
        elif static_username and static_credential:
            turn_server.update({"username": static_username, "credential": static_credential})
        if "username" in turn_server:
            ice_servers.append(turn_server)

    return {"ice_servers": ice_servers}


@app.post("/api/meetings/{meeting_code}/end")
def end_meeting(meeting_code: str, db: sqlite3.Connection = Depends(get_db)) -> dict[str, str]:
    meeting = find_meeting(db, meeting_code)
    db.execute("UPDATE meetings SET status = 'ended' WHERE id = ?", (meeting["id"],))
    db.execute("UPDATE participants SET left_at = ? WHERE meeting_id = ? AND left_at IS NULL", (utc_now().isoformat(), meeting["id"]))
    db.execute("DELETE FROM meeting_signals WHERE meeting_id = ?", (meeting["id"],))
    db.commit()
    return {"status": "ended"}
