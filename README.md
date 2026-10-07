# Zoom Clone MVP

A Zoom-inspired meeting app built with Next.js, FastAPI, and SQLite. It supports a seeded dashboard, instant meeting creation, scheduling, joining by meeting ID or invite link, and a meeting room with browser-based peer-to-peer audio/video and screen sharing. Chat, reactions, and advanced host tools are visual placeholders.

## Requirements

- Node.js 20.9 or newer
- Python 3.10 or newer

## Project folders

- `frontend/` contains the Next.js pages, styles, and npm configuration.
- `backend/` contains the FastAPI API, Python requirements, and SQLite database.

## Run locally

Open two terminals in the project root.

### Python API

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

The API starts at `http://localhost:8000`. FastAPI's interactive endpoint reference is at `http://localhost:8000/docs`.

### Next.js app

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The SQLite database is stored at `backend/zoom_clone.db`; its default host and sample meetings are seeded automatically on first API start. The API enables cross-thread SQLite access for its request-scoped connections, as required by FastAPI's synchronous route workers. For deployment, set `NEXT_PUBLIC_API_URL` in the frontend to the public API URL and set `FRONTEND_ORIGINS` in the backend to the frontend origin (comma-separated if there are multiple). The included Render blueprint starts the API on Render's free plan. Free instances have an ephemeral filesystem, so the SQLite meeting data is reset when the service restarts or redeploys. For durable production data, attach a persistent disk and set `DATABASE_PATH=/var/data/zoom_clone.db` in Render (persistent disks require a paid service).

## Data model

- `users`: default host identity. Login is intentionally omitted.
- `meetings`: title, description, unique public meeting code, host foreign key, meeting type, start time, duration, and status.
- `participants`: display name and role for each meeting attendance, linked with a meeting foreign key and join/leave times.

The relationships are one user to many meetings and one meeting to many participants. SQLite foreign-key checks and field constraints keep those links and allowed values consistent.

## API overview

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Check whether the API is running. |
| `GET` | `/api/profile` | Load the default profile and its persistent Personal Meeting ID. |
| `GET` | `/api/meetings` | Load upcoming and recent dashboard meetings. |
| `POST` | `/api/meetings` | Create an instant or scheduled meeting. |
| `GET` | `/api/meetings/{meeting_code}` | Validate a code and load room details. |
| `POST` | `/api/meetings/{meeting_code}/participants` | Join a meeting with a display name. |
| `POST` | `/api/meetings/{meeting_code}/leave` | Record a participant leaving. |
| `POST` | `/api/meetings/{meeting_code}/end` | End a meeting from the host room. |
| `POST` | `/api/meetings/{meeting_code}/signals` | Exchange WebRTC offer, answer, and ICE messages between active participants. |
| `GET` | `/api/meetings/{meeting_code}/signals` | Poll for WebRTC signaling messages addressed to the current participant. |
| `GET` | `/api/meetings/{meeting_code}/ice-servers` | Return STUN/TURN configuration to an active participant. |

## Notes

- The Host actions in the top navigation and dashboard both create an instant meeting and open its room.
- Profile-menu actions are visible placeholders and do not require account APIs.
- Meetings use generated public codes; database integer IDs stay internal.
- Peer-to-peer WebRTC media uses a public STUN server by default. To support restrictive NAT/firewall networks, configure a TURN provider that supports coturn REST shared-secret authentication on the backend: set TURN_URLS to a comma-separated list of turn:/turns: URLs and TURN_SHARED_SECRET to the provider secret. The API issues one-hour credentials to active meeting participants; keep the shared secret only on the backend. Without a TURN relay, some network pairs cannot connect. The current peer mesh is intended for small meetings, not Zoom-scale rooms.
- Camera and microphone transmission also requires each participant to grant browser permission. Screen sharing uses the browser's screen-share prompt.
- Use `npm run build` from `frontend/` to create a production frontend build. For this local MVP, run the API and frontend as separate processes.
