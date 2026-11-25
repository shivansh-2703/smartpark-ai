from pathlib import Path
import sqlite3
import uuid
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = BASE_DIR / "uploads"
DATA_DIR.mkdir(exist_ok=True)
UPLOAD_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "smartpark.db"

app = FastAPI(title="SmartPark AI API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

def connect():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db

def init_db():
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS lots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lot_number TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            camera_id TEXT UNIQUE NOT NULL,
            video_filename TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lot_id INTEGER NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
            slot_code TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'available',
            UNIQUE(lot_id, slot_code)
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_code TEXT UNIQUE NOT NULL,
            lot_id INTEGER NOT NULL REFERENCES lots(id),
            slot_id INTEGER NOT NULL REFERENCES slots(id),
            vehicle_number TEXT NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            fee REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active'
        );
        """)
        for n in range(1, 5):
            lot_no = f"LOT-{n:02d}"
            db.execute(
                "INSERT OR IGNORE INTO lots(lot_number,name,camera_id,created_at) VALUES(?,?,?,?)",
                (lot_no, f"Parking Lot {n}", f"CAM-{n:02d}", datetime.now(timezone.utc).isoformat())
            )
        lots = db.execute("SELECT id, lot_number FROM lots ORDER BY id").fetchall()
        for lot in lots:
            count = db.execute("SELECT COUNT(*) FROM slots WHERE lot_id=?", (lot["id"],)).fetchone()[0]
            if count == 0:
                for i in range(1, 7):
                    db.execute("INSERT INTO slots(lot_id,slot_code,status) VALUES(?,?,?)",
                               (lot["id"], f"{lot['lot_number'][-2:]}-S{i:02d}", "available"))
        db.commit()

@app.on_event("startup")
def startup():
    init_db()

def lot_dict(row):
    return dict(row)

def get_lot(db, lot_number):
    row = db.execute("SELECT * FROM lots WHERE lot_number=?", (lot_number.upper(),)).fetchone()
    if not row:
        raise HTTPException(404, "Parking lot not found")
    return row

class SlotCreate(BaseModel):
    slot_code: str = Field(min_length=1, max_length=30)

class SlotUpdate(BaseModel):
    status: str

class SessionCreate(BaseModel):
    lot_number: str
    slot_id: int
    vehicle_number: str = Field(min_length=1, max_length=30)

@app.get("/")
def root():
    return {"name": "SmartPark AI API", "docs": "/docs"}

@app.get("/api/health")
def health():
    return {"status": "ok", "database": "connected"}

@app.get("/api/lots")
def list_lots():
    with connect() as db:
        rows = db.execute("""
            SELECT l.*,
              COUNT(s.id) AS total_slots,
              SUM(CASE WHEN s.status='occupied' THEN 1 ELSE 0 END) AS occupied_slots
            FROM lots l LEFT JOIN slots s ON s.lot_id=l.id
            GROUP BY l.id ORDER BY l.id
        """).fetchall()
        result = []
        for r in rows:
            item = dict(r)
            item["occupied_slots"] = item["occupied_slots"] or 0
            item["available_slots"] = item["total_slots"] - item["occupied_slots"]
            item["camera_status"] = "online"
            result.append(item)
        return result

@app.get("/api/lots/{lot_number}")
def lot_detail(lot_number: str):
    with connect() as db:
        return dict(get_lot(db, lot_number))

@app.get("/api/slots")
def list_slots(lot_number: str | None = None):
    with connect() as db:
        sql = """SELECT s.*, l.lot_number FROM slots s JOIN lots l ON l.id=s.lot_id"""
        args = ()
        if lot_number:
            sql += " WHERE l.lot_number=?"
            args = (lot_number.upper(),)
        sql += " ORDER BY l.id, s.id"
        return [dict(r) for r in db.execute(sql, args).fetchall()]

@app.post("/api/lots/{lot_number}/slots")
def create_slot(lot_number: str, payload: SlotCreate):
    with connect() as db:
        lot = get_lot(db, lot_number)
        try:
            cur = db.execute("INSERT INTO slots(lot_id,slot_code,status) VALUES(?,?, 'available')",
                             (lot["id"], payload.slot_code.strip().upper()))
            db.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(409, "That slot ID already exists in this lot")
        return dict(db.execute("SELECT * FROM slots WHERE id=?", (cur.lastrowid,)).fetchone())

@app.patch("/api/slots/{slot_id}")
def update_slot(slot_id: int, payload: SlotUpdate):
    if payload.status not in ("available", "occupied"):
        raise HTTPException(400, "Status must be available or occupied")
    with connect() as db:
        row = db.execute("SELECT * FROM slots WHERE id=?", (slot_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Slot not found")
        db.execute("UPDATE slots SET status=? WHERE id=?", (payload.status, slot_id))
        db.commit()
        return dict(db.execute("SELECT * FROM slots WHERE id=?", (slot_id,)).fetchone())

@app.delete("/api/slots/{slot_id}")
def delete_slot(slot_id: int):
    with connect() as db:
        row = db.execute("SELECT id FROM slots WHERE id=?", (slot_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Slot not found")
        active = db.execute("SELECT COUNT(*) FROM sessions WHERE slot_id=? AND status='active'", (slot_id,)).fetchone()[0]
        if active:
            raise HTTPException(409, "Cannot delete a slot with an active session")
        db.execute("DELETE FROM slots WHERE id=?", (slot_id,))
        db.commit()
        return {"deleted": True}

@app.post("/api/videos/{lot_number}")
async def upload_video(lot_number: str, file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in (".mp4", ".mov", ".avi", ".mkv", ".webm"):
        raise HTTPException(400, "Upload a video file: MP4, MOV, AVI, MKV or WEBM")
    with connect() as db:
        lot = get_lot(db, lot_number)
        folder = UPLOAD_DIR / lot["lot_number"].lower().replace("-", "_")
        folder.mkdir(parents=True, exist_ok=True)
        filename = f"{uuid.uuid4().hex[:10]}{suffix}"
        destination = folder / filename
        size = 0
        with destination.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > 1024 * 1024 * 1024:
                    destination.unlink(missing_ok=True)
                    raise HTTPException(413, "Video exceeds 1 GB limit")
                out.write(chunk)
        db.execute("UPDATE lots SET video_filename=? WHERE id=?", (filename, lot["id"]))
        db.commit()
        return {"lot_number": lot["lot_number"], "filename": filename,
                "video_url": f"/uploads/{folder.name}/{filename}", "size_bytes": size}

@app.get("/api/dashboard")
def dashboard():
    with connect() as db:
        lots = db.execute("""
            SELECT COUNT(*) total_lots,
            COALESCE(SUM((SELECT COUNT(*) FROM slots s WHERE s.lot_id=l.id)),0) total_slots,
            COALESCE(SUM((SELECT COUNT(*) FROM slots s WHERE s.lot_id=l.id AND s.status='occupied')),0) occupied
            FROM lots l
        """).fetchone()
        active = db.execute("SELECT COUNT(*) FROM sessions WHERE status='active'").fetchone()[0]
        revenue = db.execute("SELECT COALESCE(SUM(fee),0) FROM sessions WHERE status='completed'").fetchone()[0]
        return {"total_lots": lots["total_lots"], "total_slots": lots["total_slots"],
                "occupied_slots": lots["occupied"], "available_slots": lots["total_slots"]-lots["occupied"],
                "active_sessions": active, "total_revenue": round(revenue, 2)}

@app.get("/api/sessions")
def list_sessions():
    with connect() as db:
        return [dict(r) for r in db.execute("""
            SELECT se.*, l.lot_number, s.slot_code FROM sessions se
            JOIN lots l ON l.id=se.lot_id JOIN slots s ON s.id=se.slot_id
            ORDER BY se.id DESC
        """).fetchall()]

@app.post("/api/sessions")
def start_session(payload: SessionCreate):
    with connect() as db:
        lot = get_lot(db, payload.lot_number)
        slot = db.execute("SELECT * FROM slots WHERE id=? AND lot_id=?", (payload.slot_id, lot["id"])).fetchone()
        if not slot:
            raise HTTPException(404, "Slot does not belong to this lot")
        if slot["status"] == "occupied":
            raise HTTPException(409, "Slot is already occupied")
        now = datetime.now(timezone.utc).isoformat()
        code = f"SES-{uuid.uuid4().hex[:8].upper()}"
        db.execute("INSERT INTO sessions(session_code,lot_id,slot_id,vehicle_number,started_at) VALUES(?,?,?,?,?)",
                   (code, lot["id"], payload.slot_id, payload.vehicle_number.strip().upper(), now))
        db.execute("UPDATE slots SET status='occupied' WHERE id=?", (payload.slot_id,))
        db.commit()
        return {"session_code": code, "status": "active", "started_at": now}

@app.post("/api/sessions/{session_code}/close")
def close_session(session_code: str):
    with connect() as db:
        session = db.execute("SELECT * FROM sessions WHERE session_code=? AND status='active'", (session_code,)).fetchone()
        if not session:
            raise HTTPException(404, "Active session not found")
        start = datetime.fromisoformat(session["started_at"])
        end = datetime.now(timezone.utc)
        minutes = max(1, int((end - start).total_seconds() // 60))
        fee = round(max(1, (minutes + 59)//60) * 30, 2)
        db.execute("UPDATE sessions SET ended_at=?, fee=?, status='completed' WHERE id=?",
                   (end.isoformat(), fee, session["id"]))
        db.execute("UPDATE slots SET status='available' WHERE id=?", (session["slot_id"],))
        db.commit()
        return {"session_code": session_code, "duration_minutes": minutes, "fee": fee, "status": "completed"}
