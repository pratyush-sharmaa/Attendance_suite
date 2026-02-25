import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

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

BASE_DIR       = os.path.join(os.path.dirname(__file__), '..', '..')
ENCODINGS_PATH = os.path.join(BASE_DIR, 'encodings', 'encodings.pkl')

# In-memory store: token -> {section_id, faculty_id, expires_at, used_rolls}
_active_sessions: dict = {}

# ── InsightFace ───────────────────────────────────────────────
_model = None
def get_model():
    global _model
    if _model is None:
        import insightface
        _model = insightface.app.FaceAnalysis(name='buffalo_l')
        _model.prepare(ctx_id=-1, det_size=(640, 640))
    return _model

def load_encodings():
    if os.path.exists(ENCODINGS_PATH):
        with open(ENCODINGS_PATH, 'rb') as f:
            return pickle.load(f)
    return {}

def cosine_similarity(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

# ══════════════════════════════════════════════════════════════
# GENERATE QR SESSION
# Faculty calls this — gets back a QR code image (base64)
# ══════════════════════════════════════════════════════════════
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
        "section_id":  section_id,
        "faculty_id":  faculty_id,
        "expires_at":  expires_at,
        "used_rolls":  set(),
        "marked":      []
    }

    base        = server_url.rstrip("/")
    student_url = f"{base}/student-attendance?token={token}"

    # Generate QR code image
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(student_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#6366f1", back_color="white")

    buf = BytesIO()
    img.save(buf, format='PNG')
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    return {
        "token":       token,
        "qr_image":    f"data:image/png;base64,{qr_b64}",
        "expires_at":  expires_at.isoformat(),
        "student_url": student_url,
        "expires_minutes": expires_minutes
    }

# ══════════════════════════════════════════════════════════════
# VALIDATE TOKEN (student page calls this to check if valid)
# ══════════════════════════════════════════════════════════════
@router.get("/validate/{token}")
def validate_token(token: str):
    session = _active_sessions.get(token)
    if not session:
        raise HTTPException(404, "Invalid or expired QR code")
    if datetime.now() > session['expires_at']:
        del _active_sessions[token]
        raise HTTPException(410, "QR code has expired. Ask faculty to generate a new one.")

    conn = get_connection()
    section = conn.execute(
        "SELECT name, department FROM sections WHERE id=?", (session['section_id'],)
    ).fetchone()
    conn.close()

    return {
        "valid":        True,
        "section_name": section['name'] if section else "Unknown",
        "department":   section['department'] if section else "",
        "expires_at":   session['expires_at'].isoformat(),
        "already_marked": list(session['used_rolls'])
    }

# ══════════════════════════════════════════════════════════════
# SUBMIT SELFIE (student submits selfie + roll number)
# ══════════════════════════════════════════════════════════════
@router.post("/submit")
async def submit_selfie(
    token:   str        = Form(...),
    roll_no: str        = Form(...),
    selfie:  UploadFile = File(...)
):
    # Validate session
    session = _active_sessions.get(token)
    if not session:
        raise HTTPException(404, "Invalid QR code. Ask faculty to regenerate.")
    if datetime.now() > session['expires_at']:
        del _active_sessions[token]
        raise HTTPException(410, "QR code expired. Ask faculty for a new one.")

    roll_no = roll_no.strip().upper()

    # Check already submitted
    if roll_no in session['used_rolls']:
        raise HTTPException(409, "You have already marked attendance for this session.")

    section_id = session['section_id']
    faculty_id = session['faculty_id']

    # Load student from DB
    conn = get_connection()
    student = conn.execute(
        "SELECT * FROM students WHERE roll_no=? AND section_id=?",
        (roll_no, section_id)
    ).fetchone()

    if not student:
        conn.close()
        raise HTTPException(404, f"Roll number '{roll_no}' not found in this section.")

    # Load their registered embedding
    encodings = load_encodings()
    if roll_no not in encodings:
        conn.close()
        raise HTTPException(400, "Your face is not registered. Contact faculty.")

    registered_embedding = encodings[roll_no]['embedding']

    # Extract embedding from selfie
    img_bytes = await selfie.read()
    arr   = np.frombuffer(img_bytes, np.uint8)
    img   = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    faces = get_model().get(img)

    if not faces:
        conn.close()
        raise HTTPException(400, "No face detected in selfie. Ensure good lighting and look straight at camera.")

    # Use largest face
    face = sorted(faces, key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]), reverse=True)[0]
    selfie_embedding = face.embedding

    # Compare with registered face
    similarity = cosine_similarity(selfie_embedding, registered_embedding)
    THRESHOLD  = 0.45  # slightly lower for selfie angle variation

    if similarity < THRESHOLD:
        conn.close()
        raise HTTPException(403, f"Face verification failed (score: {similarity:.2f}). Make sure your face is clearly visible.")

    # Mark attendance
    today = date.today().strftime('%Y-%m-%d')
    time_ = datetime.now().strftime('%H:%M:%S')
    try:
        conn.execute('''
            INSERT INTO attendance (student_id, section_id, faculty_id, date, time, method)
            VALUES (?,?,?,?,?,?)
        ''', (student['id'], section_id, faculty_id, today, time_, 'qr_selfie'))
        conn.commit()
        already = False
    except Exception:
        already = True  # already marked today
    conn.close()

    # Record in session to prevent double scan
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
        "message":    "Already marked earlier today" if already else "Attendance marked successfully! ✅"
    }

# ══════════════════════════════════════════════════════════════
# GET SESSION STATUS (faculty polls this to see who has scanned)
# ══════════════════════════════════════════════════════════════
@router.get("/session/{token}")
def get_session_status(token: str):
    session = _active_sessions.get(token)
    if not session:
        return {"active": False, "marked": []}

    expired = datetime.now() > session['expires_at']
    return {
        "active":      not expired,
        "expires_at":  session['expires_at'].isoformat(),
        "marked":      session['marked'],
        "marked_count": len(session['marked']),
        "section_id":  session['section_id']
    }

# ══════════════════════════════════════════════════════════════
# END SESSION
# ══════════════════════════════════════════════════════════════
@router.delete("/session/{token}")
def end_session(token: str):
    if token in _active_sessions:
        del _active_sessions[token]
    return {"message": "Session ended"}