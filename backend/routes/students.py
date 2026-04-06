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
import base64

router = APIRouter(prefix="/api/students", tags=["Students"])

BASE_DIR       = os.path.join(os.path.dirname(__file__), '..')
KNOWN_FACES    = os.path.join(BASE_DIR, 'known_faces')
ENCODINGS_PATH = os.path.join(BASE_DIR, 'encodings', 'encodings.pkl')

os.makedirs(KNOWN_FACES, exist_ok=True)
os.makedirs(os.path.dirname(ENCODINGS_PATH), exist_ok=True)

from face_model import get_model

# ── Cloudinary ────────────────────────────────────────────────
CLOUDINARY_CLOUD = os.environ.get('CLOUDINARY_CLOUD_NAME', '')
CLOUDINARY_KEY   = os.environ.get('CLOUDINARY_API_KEY', '')
CLOUDINARY_SEC   = os.environ.get('CLOUDINARY_API_SECRET', '')
USE_CLOUDINARY   = bool(CLOUDINARY_CLOUD and CLOUDINARY_KEY and CLOUDINARY_SEC)

if USE_CLOUDINARY:
    import cloudinary
    import cloudinary.uploader
    cloudinary.config(cloud_name=CLOUDINARY_CLOUD, api_key=CLOUDINARY_KEY, api_secret=CLOUDINARY_SEC)

def upload_photo(img_bytes: bytes, roll_no: str) -> str:
    if USE_CLOUDINARY:
        import cloudinary.uploader
        result = cloudinary.uploader.upload(
            img_bytes,
            public_id=f"students/{roll_no}",
            overwrite=True,
            folder="face_attendance"
        )
        return result['secure_url']
    else:
        arr  = np.frombuffer(img_bytes, np.uint8)
        img  = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        path = os.path.join(KNOWN_FACES, f"{roll_no}.jpg")
        cv2.imwrite(path, img)
        return path

def delete_photo(roll_no: str):
    if USE_CLOUDINARY:
        try:
            import cloudinary.uploader
            cloudinary.uploader.destroy(f"face_attendance/students/{roll_no}")
        except Exception:
            pass
    local = os.path.join(KNOWN_FACES, f"{roll_no}.jpg")
    if os.path.exists(local):
        os.remove(local)

# ── Encoding helpers ──────────────────────────────────────────
def embedding_to_str(embedding) -> str:
    return base64.b64encode(pickle.dumps(embedding)).decode('utf-8')

def str_to_embedding(s: str):
    return pickle.loads(base64.b64decode(s.encode('utf-8')))

def save_encoding_db(roll_no, name, student_id, section_id, embedding, photo_url=''):
    conn = get_connection()
    existing = conn.execute(
        "SELECT roll_no FROM face_encodings WHERE roll_no=?", (roll_no,)
    ).fetchone()
    if existing:
        conn.execute(
            "UPDATE face_encodings SET name=?, student_id=?, section_id=?, embedding=?, photo_url=? WHERE roll_no=?",
            (name, student_id, section_id, embedding_to_str(embedding), photo_url, roll_no)
        )
    else:
        conn.execute(
            "INSERT INTO face_encodings (roll_no, name, student_id, section_id, embedding, photo_url) VALUES (?,?,?,?,?,?)",
            (roll_no, name, student_id, section_id, embedding_to_str(embedding), photo_url)
        )
    conn.commit()
    conn.close()

def delete_encoding_db(roll_no):
    conn = get_connection()
    conn.execute('DELETE FROM face_encodings WHERE roll_no=?', (roll_no,))
    conn.commit()
    conn.close()

def load_encodings():
    """Load from Turso DB first, fall back to pkl file."""
    try:
        conn = get_connection()
        rows = conn.execute(
            'SELECT roll_no, name, student_id, section_id, embedding, photo_url FROM face_encodings'
        ).fetchall()
        conn.close()
        if rows:
            encodings = {}
            for r in rows:
                try:
                    encodings[r['roll_no']] = {
                        'name':       r['name'],
                        'student_id': r['student_id'],
                        'section_id': r['section_id'],
                        'embedding':  str_to_embedding(r['embedding']),
                        'photo_url':  r['photo_url'] or '',
                    }
                except Exception:
                    pass
            if encodings:
                return encodings
    except Exception as e:
        print(f"⚠️ DB encoding load failed: {e}")
    if os.path.exists(ENCODINGS_PATH):
        with open(ENCODINGS_PATH, 'rb') as f:
            return pickle.load(f)
    return {}

def extract_embedding(img_bytes: bytes):
    arr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return None, None
    faces = get_model().get(img)
    if not faces:
        return None, None
    face = sorted(faces, key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]), reverse=True)[0]
    return face.normed_embedding, img

def get_auth(request: Request):
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    payload = decode_token(auth.split(" ")[1])
    if not payload:
        raise HTTPException(401, "Invalid token")
    return payload

# ── Routes ────────────────────────────────────────────────────

@router.post("/register")
async def register_student(
    request:      Request,
    name:         str        = Form(...),
    roll_no:      str        = Form(...),
    section_id:   int        = Form(...),
    phone:        str        = Form(""),
    parent_email: str        = Form(""),
    parent_name:  str        = Form(""),
    parent_phone: str        = Form(""),
    photo:        UploadFile = File(...),
):
    get_auth(request)
    img_bytes = await photo.read()
    if not img_bytes:
        raise HTTPException(400, "Photo file is empty.")

    embedding, img = extract_embedding(img_bytes)
    if embedding is None:
        raise HTTPException(400, "No face detected. Use a clear front-facing photo in good lighting.")

    # ── Per-semester uniqueness check ─────────────────────────
    conn_sec = get_connection()
    target_sec = conn_sec.execute(
        "SELECT semester FROM sections WHERE id=?", (section_id,)
    ).fetchone()
    conn_sec.close()

    if target_sec and target_sec['semester']:
        target_semester = target_sec['semester']
        conn_dup = get_connection()
        duplicate = conn_dup.execute("""
            SELECT st.id FROM students st
            JOIN sections sec ON sec.id = st.section_id
            WHERE UPPER(TRIM(st.roll_no)) = UPPER(TRIM(?))
              AND sec.semester = ?
        """, (roll_no, target_semester)).fetchone()
        conn_dup.close()
        if duplicate:
            raise HTTPException(
                400,
                f"Roll number '{roll_no}' already registered in Semester {target_semester}. "
                f"A student cannot be in two sections of the same semester."
            )

    photo_url = upload_photo(img_bytes, roll_no)

    conn = get_connection()
    try:
        conn.execute(
            '''INSERT INTO students
               (name, roll_no, section_id, phone, parent_email, parent_name, parent_phone, photo_url)
               VALUES (?,?,?,?,?,?,?,?)''',
            (name, roll_no, section_id, phone, parent_email, parent_name, parent_phone, photo_url)
        )
        conn.commit()
        student_id = conn.execute(
            "SELECT id FROM students WHERE roll_no=? AND section_id=?", (roll_no, section_id)
        ).fetchone()['id']
    except Exception as e:
        conn.close()
        raise HTTPException(400, f"DB error: {str(e)}")
    conn.close()

    local_path = os.path.join(KNOWN_FACES, f"{roll_no}.jpg")
    cv2.imwrite(local_path, img)
    save_encoding_db(roll_no, name, student_id, section_id, embedding, photo_url)

    return {
        "message":    f"{name} registered successfully",
        "student_id": student_id,
        "photo_url":  photo_url
    }


@router.get("/section/{section_id}")
def get_students_by_section(section_id: int):
    conn = get_connection()
    rows = conn.execute('''
        SELECT s.id, s.name, s.roll_no, s.phone, s.registered_at,
               s.parent_email, s.parent_name, s.parent_phone,
               s.photo_url,
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
    student = conn.execute(
        "SELECT roll_no, name FROM students WHERE id=?", (student_id,)
    ).fetchone()
    if not student:
        conn.close()
        raise HTTPException(404, "Student not found")
    roll_no = student['roll_no']
    name    = student['name']
    conn.execute("DELETE FROM attendance WHERE student_id=?", (student_id,))
    conn.execute("DELETE FROM students WHERE id=?", (student_id,))
    conn.commit()
    conn.close()
    delete_photo(roll_no)
    delete_encoding_db(roll_no)
    return {"message": f"{name} deleted successfully"}


@router.put("/{student_id}")
async def update_student(
    request:      Request,
    student_id:   int,
    name:         str                  = Form(...),
    roll_no:      str                  = Form(...),
    phone:        str                  = Form(""),
    parent_email: str                  = Form(""),
    parent_name:  str                  = Form(""),
    parent_phone: str                  = Form(""),
    section_id:   int                  = Form(...),
    photo:        Optional[UploadFile] = File(None),
):
    get_auth(request)
    conn = get_connection()
    existing = conn.execute(
        "SELECT id, name, roll_no, section_id, phone, parent_email, parent_name, parent_phone, photo_url FROM students WHERE id=?",
        (student_id,)
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(404, "Student not found")

    photo_url = existing['photo_url'] or ''

    if photo and photo.filename:
        img_bytes = await photo.read()
        if img_bytes:
            embedding, img = extract_embedding(img_bytes)
            if embedding is None:
                conn.close()
                raise HTTPException(400, "No face detected in new photo.")
            photo_url = upload_photo(img_bytes, roll_no)
            local_path = os.path.join(KNOWN_FACES, f"{roll_no}.jpg")
            cv2.imwrite(local_path, img)
            save_encoding_db(roll_no, name, student_id, section_id, embedding, photo_url)

    conn.execute(
        '''UPDATE students
           SET name=?, roll_no=?, phone=?, parent_email=?,
               parent_name=?, parent_phone=?, section_id=?, photo_url=?
           WHERE id=?''',
        (name, roll_no, phone, parent_email, parent_name, parent_phone,
         section_id, photo_url, student_id)
    )
    conn.commit()
    conn.close()
    return {"message": f"{name} updated successfully", "photo_url": photo_url}


@router.get("/restore-encodings")
def restore_encodings_from_db():
    encodings = load_encodings()
    if encodings:
        os.makedirs(os.path.dirname(ENCODINGS_PATH), exist_ok=True)
        with open(ENCODINGS_PATH, 'wb') as f:
            pickle.dump(encodings, f)
    return {"message": f"Restored {len(encodings)} encodings from DB"}


@router.post("/migrate-encodings")
async def migrate_encodings_from_cloudinary():
    import httpx
    conn     = get_connection()
    students = conn.execute(
        "SELECT id, roll_no, name, section_id, photo_url FROM students WHERE photo_url != '' AND photo_url IS NOT NULL"
    ).fetchall()
    conn.close()

    success, failed = [], []
    for s in students:
        roll_no   = s['roll_no']
        photo_url = s['photo_url']
        enc_conn  = get_connection()
        existing  = enc_conn.execute(
            "SELECT roll_no FROM face_encodings WHERE roll_no=?", (roll_no,)
        ).fetchone()
        enc_conn.close()
        if existing:
            success.append(f"{s['name']} (already in DB)")
            continue
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(photo_url)
            img_bytes = resp.content
            embedding, img = extract_embedding(img_bytes)
            if embedding is None:
                failed.append(f"{s['name']} — no face detected")
                continue
            cv2.imwrite(os.path.join(KNOWN_FACES, f"{roll_no}.jpg"), img)
            save_encoding_db(roll_no, s['name'], s['id'], s['section_id'], embedding, photo_url)
            success.append(s['name'])
        except Exception as e:
            failed.append(f"{s['name']} — {str(e)}")

    return {"migrated": len(success), "failed": len(failed), "details": success + failed}
