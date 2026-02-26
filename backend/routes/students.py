import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

os.environ['OMP_NUM_THREADS'] = '1'

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
from database import get_connection
from auth import decode_token
from typing import Optional
import cv2
import numpy as np
import pickle
import insightface

router = APIRouter(prefix="/api/students", tags=["Students"])

BASE_DIR       = os.path.join(os.path.dirname(__file__), '..')
KNOWN_FACES    = os.path.join(BASE_DIR, 'known_faces')
ENCODINGS_PATH = os.path.join(BASE_DIR, 'encodings', 'encodings.pkl')

os.makedirs(KNOWN_FACES, exist_ok=True)
os.makedirs(os.path.dirname(ENCODINGS_PATH), exist_ok=True)

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

def save_encodings(data):
    with open(ENCODINGS_PATH, 'wb') as f:
        pickle.dump(data, f)

def extract_embedding(img_bytes: bytes):
    arr   = np.frombuffer(img_bytes, np.uint8)
    img   = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    faces = get_model().get(img)
    if not faces:
        return None, None
    face = sorted(faces, key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]), reverse=True)[0]
    return face.embedding, img

def get_auth(request: Request):
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    payload = decode_token(auth.split(" ")[1])
    if not payload:
        raise HTTPException(401, "Invalid token")
    return payload

@router.post("/register")
async def register_student(
    request:    Request,
    name:       str        = Form(...),
    roll_no:    str        = Form(...),
    section_id: int        = Form(...),
    phone:      str        = Form(""),
    photo:      UploadFile = File(...),
):
    get_auth(request)
    img_bytes = await photo.read()
    embedding, img = extract_embedding(img_bytes)
    if embedding is None:
        raise HTTPException(400, "No face detected. Use a clearer front-facing photo.")

    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO students (name, roll_no, section_id, phone) VALUES (?,?,?,?)",
            (name, roll_no, section_id, phone)
        )
        conn.commit()
        student_id = conn.execute(
            "SELECT id FROM students WHERE roll_no=?", (roll_no,)
        ).fetchone()['id']
    except Exception as e:
        conn.close()
        raise HTTPException(400, f"Roll number already exists or DB error: {str(e)}")

    img_path = os.path.join(KNOWN_FACES, f"{roll_no}.jpg")
    cv2.imwrite(img_path, img)

    encodings = load_encodings()
    encodings[roll_no] = {
        "name":       name,
        "student_id": student_id,
        "section_id": section_id,
        "embedding":  embedding
    }
    save_encodings(encodings)
    conn.close()
    return {"message": f"{name} registered successfully", "student_id": student_id}

@router.get("/section/{section_id}")
def get_students_by_section(section_id: int):
    conn = get_connection()
    rows = conn.execute('''
        SELECT s.id, s.name, s.roll_no, s.phone, s.registered_at, s.parent_email, s.parent_name, s.parent_phone,
               sec.name as section_name
        FROM students s
        JOIN sections sec ON sec.id = s.section_id
        WHERE s.section_id = ?
        ORDER BY s.name
    ''', (section_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@router.delete("/{student_id}")
def delete_student(student_id: int):
    conn = get_connection()
    student = conn.execute("SELECT roll_no FROM students WHERE id=?", (student_id,)).fetchone()
    if not student:
        raise HTTPException(404, "Student not found")
    roll_no = student['roll_no']
    conn.execute("DELETE FROM attendance WHERE student_id=?", (student_id,))
    conn.execute("DELETE FROM students WHERE id=?", (student_id,))
    conn.commit()
    conn.close()

    img_path = os.path.join(KNOWN_FACES, f"{roll_no}.jpg")
    if os.path.exists(img_path):
        os.remove(img_path)

    encodings = load_encodings()
    if roll_no in encodings:
        del encodings[roll_no]
        save_encodings(encodings)
    return {"message": "Student deleted successfully"}

@router.put("/{student_id}")
async def update_student(
    request:      Request,
    student_id:   int,
    name:         str        = Form(...),
    roll_no:      str        = Form(...),
    phone:        str        = Form(""),
    parent_email: str        = Form(""),
    parent_name:  str        = Form(""),
    parent_phone: str        = Form(""),
    photo:        UploadFile = File(None),
):
    get_auth(request)
    conn = get_connection()
    student = conn.execute("SELECT * FROM students WHERE id=?", (student_id,)).fetchone()
    if not student:
        conn.close()
        raise HTTPException(404, "Student not found")

    old_roll = student['roll_no']
    conn.execute(
        "UPDATE students SET name=?, phone=?, parent_email=?, parent_name=?, parent_phone=? WHERE id=?",
        (name, phone, parent_email, parent_name, parent_phone, student_id)
    )
    conn.commit()

    if photo and photo.filename:
        img_bytes = await photo.read()
        if img_bytes:
            embedding, img = extract_embedding(img_bytes)
            if embedding is None:
                conn.close()
                raise HTTPException(400, "No face detected in new photo.")
            img_path = os.path.join(KNOWN_FACES, f"{old_roll}.jpg")
            cv2.imwrite(img_path, img)
            encodings = load_encodings()
            if old_roll in encodings:
                encodings[old_roll]['name']      = name
                encodings[old_roll]['embedding'] = embedding
                save_encodings(encodings)

    conn.close()
    return {"message": f"{name} updated successfully"}