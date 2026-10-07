# Zoom Clone MVP

A Zoom-inspired meeting app built with Next.js, FastAPI, and SQLite. It supports a seeded dashboard, instant meeting creation, scheduling, joining by meeting ID or invite link, and a simple meeting room. Video tiles and media controls are interface placeholders; live audio/video calling is outside this MVP.

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

Open `http://localhost:3000`. The SQLite database is stored at `backend/zoom_clone.db`; its default host and sample meetings are seeded automatically on first API start. The API enables cross-thread SQLite access for its request-scoped connections, as required by FastAPI's synchronous route workers.

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

## Notes

- The Host actions in the top navigation and dashboard both create an instant meeting and open its room.
- Profile-menu actions are visible placeholders and do not require account APIs.
- Meetings use generated public codes; database integer IDs stay internal.
- Use `npm run build` from `frontend/` to create a production frontend build. For this local MVP, run the API and frontend as separate processes.
