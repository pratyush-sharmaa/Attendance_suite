import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

os.environ['OMP_NUM_THREADS'] = '1'

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse
from database import get_connection
from datetime import datetime, date, timedelta
import secrets
import cv2
import numpy as np
import pickle
import qrcode
import base64
from io import BytesIO

router = APIRouter(prefix="/api/qr", tags=["QR Attendance"])

BASE_DIR       = os.path.join(os.path.dirname(__file__), '..')
ENCODINGS_PATH = os.path.join(BASE_DIR, 'encodings', 'encodings.pkl')

_active_sessions: dict = {}

from face_model import get_model
# ── Import DB-backed helpers from students.py ─────────────────
from routes.students import (
    load_encodings,        # reads from Turso DB first, pkl fallback
    extract_embedding,     # runs InsightFace on image bytes
    str_to_embedding,      # deserializes base64 embedding from DB
)

def load_encodings_normalized():
    """Load from Turso DB (via students.load_encodings) with uppercase keys."""
    raw = load_encodings()
    return {k.strip().upper(): v for k, v in raw.items()}

def cosine_similarity(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

@router.post("/generate")
def generate_qr(
    section_id:      int = Form(...),
    faculty_id:      int = Form(...),
    expires_minutes: int = Form(2),
    server_url:      str = Form("http://localhost:5173")
):
    token      = secrets.token_urlsafe(32)
    expires_at = datetime.now() + timedelta(minutes=expires_minutes)
    _active_sessions[token] = {
        "section_id": section_id, "faculty_id": faculty_id,
        "expires_at": expires_at, "used_rolls": set(), "marked": []
    }
    base        = server_url.rstrip("/")
    student_url = f"{base}/student-attendance?token={token}"

    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(student_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#6366f1", back_color="white")
    buf = BytesIO()
    img.save(buf, format='PNG')
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    return {
        "token": token, "qr_image": f"data:image/png;base64,{qr_b64}",
        "expires_at": expires_at.isoformat(), "student_url": student_url,
        "expires_minutes": expires_minutes
    }

@router.get("/validate/{token}")
def validate_token(token: str):
    session = _active_sessions.get(token)
    if not session:
        raise HTTPException(404, "Invalid or expired QR code")
    if datetime.now() > session['expires_at']:
        del _active_sessions[token]
        raise HTTPException(410, "QR code has expired.")
    conn = get_connection()
    section = conn.execute(
        "SELECT name, department FROM sections WHERE id=?",
        (session['section_id'],)
    ).fetchone()
    conn.close()
    return {
        "valid": True,
        "section_name": section['name'] if section else "Unknown",
        "department":   section['department'] if section else "",
        "expires_at":   session['expires_at'].isoformat(),
        "already_marked": list(session['used_rolls'])
    }

@router.post("/submit")
async def submit_selfie(
    token:   str        = Form(...),
    roll_no: str        = Form(...),
    selfie:  UploadFile = File(...)
):
    session = _active_sessions.get(token)
    if not session:
        raise HTTPException(404, "Invalid QR code.")
    if datetime.now() > session['expires_at']:
        del _active_sessions[token]
        raise HTTPException(410, "QR code expired.")

    roll_no = roll_no.strip().upper()

    if roll_no in session['used_rolls']:
        raise HTTPException(409, "You have already marked attendance.")

    section_id = session['section_id']
    faculty_id = session['faculty_id']

    # ── 1. Find student in DB ─────────────────────────────────
    conn = get_connection()
    student = conn.execute(
        "SELECT id, name, roll_no FROM students WHERE UPPER(TRIM(roll_no))=? AND section_id=?",
        (roll_no, section_id)
    ).fetchone()
    conn.close()

    if not student:
        raise HTTPException(404, f"Roll number '{roll_no}' not found in this section. Please check your roll number.")

    # ── 2. Load embedding from Turso DB directly ──────────────
    conn2 = get_connection()
    enc_row = conn2.execute(
        "SELECT embedding FROM face_encodings WHERE UPPER(TRIM(roll_no))=?",
        (roll_no,)
    ).fetchone()
    conn2.close()

    if not enc_row or not enc_row['embedding']:
        raise HTTPException(400, "Your face photo is not registered. Please ask your faculty to register your photo first.")

    registered_embedding = str_to_embedding(enc_row['embedding'])

    # ── 3. Extract embedding from submitted selfie ────────────
    img_bytes = await selfie.read()
    if not img_bytes:
        raise HTTPException(400, "Empty photo received.")

    selfie_embedding, _ = extract_embedding(img_bytes)
    if selfie_embedding is None:
        raise HTTPException(400, "No face detected in your selfie. Please retake in good lighting, facing the camera.")

    # ── 4. Compare embeddings ─────────────────────────────────
    similarity = cosine_similarity(selfie_embedding, registered_embedding)

    if similarity < 0.45:
        raise HTTPException(403, f"Face verification failed (score: {similarity:.2f}). Please retake your selfie in good lighting.")

    # ── 5. Mark attendance ────────────────────────────────────
    today = date.today().strftime('%Y-%m-%d')
    time_ = datetime.now().strftime('%H:%M:%S')
    conn3 = get_connection()
    try:
        conn3.execute(
            "INSERT INTO attendance (student_id, section_id, faculty_id, date, time, method) VALUES (?,?,?,?,?,?)",
            (student['id'], section_id, faculty_id, today, time_, 'qr')
        )
        conn3.commit()
        already = False
    except Exception:
        already = True
    conn3.close()

    session['used_rolls'].add(roll_no)
    session['marked'].append({
        "name":    student['name'],
        "roll_no": roll_no,
        "time":    time_,
        "score":   round(similarity, 3)
    })

    return {
        "success":    True,
        "name":       student['name'],
        "roll_no":    roll_no,
        "similarity": round(similarity, 3),
        "already":    already,
        "message":    "Already marked earlier today" if already else "Attendance marked successfully!"
    }

@router.get("/session/{token}")
def get_session_status(token: str):
    session = _active_sessions.get(token)
    if not session:
        return {"active": False, "marked": []}
    expired = datetime.now() > session['expires_at']
    return {
        "active":        not expired,
        "expires_at":    session['expires_at'].isoformat(),
        "marked":        session['marked'],
        "marked_count":  len(session['marked']),
        "section_id":    session['section_id']
    }

@router.delete("/session/{token}")
def end_session(token: str):
    if token in _active_sessions:
        del _active_sessions[token]
    return {"message": "Session ended"}
