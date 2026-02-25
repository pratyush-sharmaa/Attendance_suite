from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from database import get_connection

SECRET_KEY = "face_attendance_super_secret_key_2024"
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Password utils ───────────────────────────────────────────────
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

# ── JWT utils ────────────────────────────────────────────────────
def create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None

# ── Login logic ──────────────────────────────────────────────────
def login_admin(username: str, password: str):
    conn = get_connection()
    admin = conn.execute(
        "SELECT * FROM admins WHERE username = ?", (username,)
    ).fetchone()
    conn.close()
    if not admin or not verify_password(password, admin['password_hash']):
        return None
    return create_token({"sub": str(admin['id']), "role": "admin", "name": username})

def login_faculty(email: str, password: str):
    conn = get_connection()
    faculty = conn.execute(
        "SELECT * FROM faculties WHERE email = ?", (email,)
    ).fetchone()
    conn.close()
    if not faculty or not verify_password(password, faculty['password_hash']):
        return None
    return create_token({
        "sub": str(faculty['id']),
        "role": "faculty",
        "name": faculty['name'],
        "email": faculty['email']
    })