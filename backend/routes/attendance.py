import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

os.environ['OMP_NUM_THREADS'] = '1'

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
from database import get_connection
from auth import decode_token
from datetime import date, datetime
import cv2
import numpy as np
import pickle
import insightface

router = APIRouter(prefix="/api/attendance", tags=["Attendance"])

BASE_DIR       = os.path.join(os.path.dirname(__file__), '..')
ENCODINGS_PATH = os.path.join(BASE_DIR, 'encodings', 'encodings.pkl')
UNKNOWN_PATH   = os.path.join(BASE_DIR, 'unknown_faces')
CLASSROOM_PATH = os.path.join(BASE_DIR, 'classroom_outputs')

os.makedirs(UNKNOWN_PATH,   exist_ok=True)
os.makedirs(CLASSROOM_PATH, exist_ok=True)

_model = None
def get_model():
    global _model
    if _model is None:
        _model = insightface.app.FaceAnalysis(
            name='buffalo_s',
            providers=['CPUExecutionProvider']
        )
        _model.prepare(ctx_id=0, det_size=(320, 320))
    return _model

def load_encodings():
    if os.path.exists(ENCODINGS_PATH):
        with open(ENCODINGS_PATH, 'rb') as f:
            return pickle.load(f)
    return {}

def cosine_similarity(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

def identify_face(embedding, section_id=None, threshold=0.5):
    encodings  = load_encodings()
    best       = None
    best_score = -1
    for roll_no, data in encodings.items():
        if section_id and data.get('section_id') != section_id:
            continue
        score = cosine_similarity(embedding, data['embedding'])
        if score > best_score:
            best_score = score
            best = (roll_no, data['name'], data['student_id'], data.get('section_id'))
    if best and best_score >= threshold:
        return (*best, best_score)
    return "unknown", "Unknown", None, None, best_score

def mark_attendance_db(student_id, section_id, faculty_id, method):
    today = date.today().strftime('%Y-%m-%d')
    time_ = datetime.now().strftime('%H:%M:%S')
    conn  = get_connection()
    try:
        conn.execute('''
            INSERT INTO attendance (student_id, section_id, faculty_id, date, time, method)
            VALUES (?,?,?,?,?,?)
        ''', (student_id, section_id, faculty_id, today, time_, method))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def save_unknown(img_crop, faculty_id, section_id, method):
    ts   = datetime.now().strftime('%Y%m%d_%H%M%S')
    path = os.path.join(UNKNOWN_PATH, f"unknown_{ts}.jpg")
    cv2.imwrite(path, img_crop)
    conn = get_connection()
    conn.execute(
        "INSERT INTO unknown_logs (snapshot_path, faculty_id, section_id, method) VALUES (?,?,?,?)",
        (path, faculty_id, section_id, method)
    )
    conn.commit()
    conn.close()
    return path

@router.post("/process")
async def process_attendance(
    request:    Request,
    photo:      UploadFile = File(...),
    section_id: int        = Form(...),
    faculty_id: int        = Form(...),
    method:     str        = Form("webcam"),
    threshold:  float      = Form(0.5)
):
    img_bytes = await photo.read()
    arr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Could not read image")

    model   = get_model()
    faces   = model.get(img)
    results = []

    for face in faces:
        x1, y1, x2, y2 = [int(v) for v in face.bbox]
        roll_no, name, student_id, sec_id, similarity = identify_face(
            face.embedding, section_id, threshold
        )
        if name == "Unknown":
            crop = img[max(0,y1):y2, max(0,x1):x2]
            if crop.size > 0:
                save_unknown(crop, faculty_id, section_id, method)
            status = "unknown"
            color  = (0, 0, 255)
        else:
            marked = mark_attendance_db(student_id, section_id, faculty_id, method)
            status = "marked" if marked else "already_marked"
            color  = (0, 255, 0) if marked else (0, 165, 255)

        cv2.rectangle(img, (x1,y1), (x2,y2), color, 2)
        label = f"{name} ({similarity:.2f})"
        cv2.putText(img, label, (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        results.append({
            "name": name, "roll_no": roll_no,
            "similarity": round(similarity, 3),
            "status": status, "bbox": [x1, y1, x2, y2]
        })

    if method == "classroom":
        ts       = datetime.now().strftime('%Y%m%d_%H%M%S')
        out_path = os.path.join(CLASSROOM_PATH, f"class_{ts}.jpg")
        cv2.imwrite(out_path, img)

    import base64
    _, buffer  = cv2.imencode('.jpg', img)
    img_base64 = base64.b64encode(buffer).decode('utf-8')

    summary = {
        "total_faces":    len(results),
        "marked":         sum(1 for r in results if r['status'] == 'marked'),
        "already_marked": sum(1 for r in results if r['status'] == 'already_marked'),
        "unknown":        sum(1 for r in results if r['status'] == 'unknown'),
    }
    return {"results": results, "summary": summary, "annotated_image": f"data:image/jpeg;base64,{img_base64}"}

@router.get("/section/{section_id}")
def get_section_attendance(section_id: int, date_str: str = None):
    if not date_str:
        date_str = date.today().strftime('%Y-%m-%d')
    conn = get_connection()
    rows = conn.execute('''
        SELECT s.name, s.roll_no, a.time, a.method, a.date
        FROM attendance a JOIN students s ON s.id = a.student_id
        WHERE a.section_id = ? AND a.date = ? ORDER BY a.time
    ''', (section_id, date_str)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@router.get("/section/{section_id}/summary")
def get_section_summary(section_id: int):
    conn = get_connection()
    rows = conn.execute('''
        SELECT s.name, s.roll_no, COUNT(a.id) as total_present
        FROM students s LEFT JOIN attendance a ON a.student_id = s.id
        WHERE s.section_id = ? GROUP BY s.id ORDER BY s.name
    ''', (section_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@router.get("/section/{section_id}/dates")
def get_attendance_dates(section_id: int):
    conn = get_connection()
    rows = conn.execute('''
        SELECT date, COUNT(*) as present_count
        FROM attendance WHERE section_id = ?
        GROUP BY date ORDER BY date DESC
    ''', (section_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@router.get("/unknown-logs")
def get_unknown_logs(faculty_id: int = None):
    conn   = get_connection()
    query  = "SELECT * FROM unknown_logs"
    params = []
    if faculty_id:
        query += " WHERE faculty_id = ?"
        params.append(faculty_id)
    query += " ORDER BY detected_at DESC LIMIT 50"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]