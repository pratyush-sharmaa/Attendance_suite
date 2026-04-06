from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from database import init_db, get_connection
from auth import login_admin, login_faculty, decode_token, hash_password
from routes.students      import router as students_router
from routes.attendance    import router as attendance_router
from routes.qr_attendance import router as qr_router
from routes.email_alerts  import router as alerts_router
from routes.chatbot       import router as chat_router

app = FastAPI(title="Face Attendance API", version="2.0")

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:4173",
    os.environ.get("FRONTEND_URL", ""),
]
ALLOWED_ORIGINS = [o for o in ALLOWED_ORIGINS if o]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def count(conn, sql, params=()):
    row = conn.execute(sql, params).fetchone()
    try:    return row['c']
    except: return row[0]

@app.on_event("startup")
def startup():
    init_db()
    try:
        import pickle
        from routes.students import load_encodings, ENCODINGS_PATH
        encodings = load_encodings()
        if encodings:
            os.makedirs(os.path.dirname(ENCODINGS_PATH), exist_ok=True)
            with open(ENCODINGS_PATH, 'wb') as f:
                pickle.dump(encodings, f)
            print(f"✅ Restored {len(encodings)} face encodings from DB")
        else:
            print("⚠️ No face encodings in DB yet")
    except Exception as e:
        print(f"⚠️ Could not restore encodings: {e}")

def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ")[1]
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload

def require_admin(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def require_faculty(user=Depends(get_current_user)):
    if user.get("role") not in ("faculty", "admin"):
        raise HTTPException(status_code=403, detail="Faculty access required")
    return user

class LoginRequest(BaseModel):
    username: Optional[str] = None
    email:    Optional[str] = None
    password: str

@app.post("/api/auth/admin-login")
def admin_login(body: LoginRequest):
    token = login_admin(body.username, body.password)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": token, "role": "admin"}

@app.post("/api/auth/faculty-login")
def faculty_login(body: LoginRequest):
    token = login_faculty(body.email, body.password)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": token, "role": "faculty"}

@app.get("/api/auth/me")
def get_me(user=Depends(get_current_user)):
    return user

class FacultyCreate(BaseModel):
    name:       str
    email:      str
    password:   str
    department: Optional[str] = ""

class FacultyUpdate(BaseModel):
    name:       str
    email:      str
    department: Optional[str] = ""
    password:   Optional[str] = None

@app.get("/api/admin/faculties")
def get_faculties(user=Depends(require_admin)):
    conn = get_connection()
    rows = conn.execute('''
        SELECT f.id, f.name, f.email, f.department, f.created_at,
               COUNT(s.id) as section_count
        FROM faculties f LEFT JOIN sections s ON s.faculty_id = f.id
        GROUP BY f.id ORDER BY f.name
    ''').fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/admin/faculties")
def create_faculty(body: FacultyCreate, user=Depends(require_admin)):
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO faculties (name, email, password_hash, department) VALUES (?,?,?,?)",
            (body.name, body.email, hash_password(body.password), body.department)
        )
        conn.commit()
        return {"message": f"Faculty {body.name} created successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.put("/api/admin/faculties/{faculty_id}")
def update_faculty(faculty_id: int, data: FacultyUpdate, user=Depends(require_admin)):
    conn = get_connection()
    if not conn.execute("SELECT id FROM faculties WHERE id=?", (faculty_id,)).fetchone():
        conn.close()
        raise HTTPException(404, "Faculty not found")
    if data.password:
        conn.execute(
            "UPDATE faculties SET name=?, email=?, department=?, password_hash=? WHERE id=?",
            (data.name, data.email, data.department, hash_password(data.password), faculty_id)
        )
    else:
        conn.execute(
            "UPDATE faculties SET name=?, email=?, department=? WHERE id=?",
            (data.name, data.email, data.department, faculty_id)
        )
    conn.commit()
    conn.close()
    return {"message": "Faculty updated"}

@app.delete("/api/admin/faculties/{faculty_id}")
def delete_faculty(faculty_id: int, user=Depends(require_admin)):
    conn = get_connection()
    conn.execute("DELETE FROM faculties WHERE id = ?", (faculty_id,))
    conn.commit()
    conn.close()
    return {"message": "Faculty deleted"}

# ── Sections ──────────────────────────────────────────────────

class SectionCreate(BaseModel):
    name:       str
    department: Optional[str] = ""
    semester:   Optional[str] = ""
    faculty_id: int

class SectionUpdate(BaseModel):
    name:       str
    department: Optional[str] = ""
    semester:   Optional[str] = ""
    faculty_id: int

@app.get("/api/admin/sections")
def get_all_sections(user=Depends(require_admin)):
    conn = get_connection()
    rows = conn.execute('''
        SELECT s.id, s.name, s.department, s.semester, s.faculty_id,
               f.name as faculty_name, COUNT(st.id) as student_count
        FROM sections s
        LEFT JOIN faculties f ON f.id = s.faculty_id
        LEFT JOIN students st ON st.section_id = s.id
        GROUP BY s.id ORDER BY s.semester, s.name
    ''').fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/admin/sections")
def create_section(body: SectionCreate, user=Depends(require_admin)):
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO sections (name, department, semester, faculty_id) VALUES (?,?,?,?)",
            (body.name, body.department, body.semester, body.faculty_id)
        )
        conn.commit()
        return {"message": f"Section {body.name} created"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.put("/api/admin/sections/{section_id}")
def update_section(section_id: int, data: SectionUpdate, user=Depends(require_admin)):
    conn = get_connection()
    if not conn.execute("SELECT id FROM sections WHERE id=?", (section_id,)).fetchone():
        conn.close()
        raise HTTPException(404, "Section not found")
    conn.execute(
        "UPDATE sections SET name=?, department=?, semester=?, faculty_id=? WHERE id=?",
        (data.name, data.department, data.semester, data.faculty_id, section_id)
    )
    conn.commit()
    conn.close()
    return {"message": "Section updated"}

@app.delete("/api/admin/sections/{section_id}")
def delete_section(section_id: int, user=Depends(require_admin)):
    conn = get_connection()
    conn.execute("DELETE FROM sections WHERE id = ?", (section_id,))
    conn.commit()
    conn.close()
    return {"message": "Section deleted"}

@app.get("/api/admin/stats")
def admin_stats(user=Depends(require_admin)):
    from datetime import date
    today = date.today().strftime('%Y-%m-%d')
    conn = get_connection()
    stats = {
        "total_faculties": count(conn, "SELECT COUNT(*) as c FROM faculties"),
        "total_sections":  count(conn, "SELECT COUNT(*) as c FROM sections"),
        "total_students":  count(conn, "SELECT COUNT(*) as c FROM students"),
        "present_today":   count(conn, "SELECT COUNT(*) as c FROM attendance WHERE date=?", (today,)),
        "unknown_today":   count(conn, "SELECT COUNT(*) as c FROM unknown_logs WHERE DATE(detected_at)=?", (today,)),
    }
    conn.close()
    return stats

@app.get("/api/faculty/sections")
def get_my_sections(user=Depends(require_faculty)):
    faculty_id = int(user['sub'])
    conn = get_connection()
    rows = conn.execute('''
        SELECT s.id, s.name, s.department, s.semester, COUNT(st.id) as student_count
        FROM sections s LEFT JOIN students st ON st.section_id = s.id
        WHERE s.faculty_id = ? GROUP BY s.id ORDER BY s.semester, s.name
    ''', (faculty_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/faculty/sections/{section_id}/students")
def get_section_students(section_id: int, user=Depends(require_faculty)):
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, name, roll_no, phone, registered_at FROM students WHERE section_id=? ORDER BY name",
        (section_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/faculty/stats")
def faculty_stats(user=Depends(require_faculty)):
    from datetime import date
    faculty_id = int(user['sub'])
    today = date.today().strftime('%Y-%m-%d')
    conn = get_connection()
    stats = {
        "my_sections":   count(conn, "SELECT COUNT(*) as c FROM sections WHERE faculty_id=?", (faculty_id,)),
        "my_students":   count(conn, "SELECT COUNT(*) as c FROM students s JOIN sections sec ON sec.id=s.section_id WHERE sec.faculty_id=?", (faculty_id,)),
        "marked_today":  count(conn, "SELECT COUNT(*) as c FROM attendance WHERE faculty_id=? AND date=?", (faculty_id, today)),
        "unknown_today": count(conn, "SELECT COUNT(*) as c FROM unknown_logs WHERE faculty_id=? AND DATE(detected_at)=?", (faculty_id, today)),
    }
    conn.close()
    return stats

app.include_router(students_router)
app.include_router(attendance_router)
app.include_router(qr_router)
app.include_router(alerts_router)
app.include_router(chat_router)

@app.get("/")
def root():
    return {"status": "Face Attendance API Running", "version": "2.0"}

if __name__ == '__main__':
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), reload=True)
