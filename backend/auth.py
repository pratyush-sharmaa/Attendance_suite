from jose import JWTError, jwt
from datetime import datetime, timedelta
from database import get_connection
import warnings

# Suppress passlib bcrypt version warning
warnings.filterwarnings("ignore", ".*error reading bcrypt version.*")

from passlib.context import CryptContext

SECRET_KEY  = "face_attendance_super_secret_key_2024"
ALGORITHM   = "HS256"
EXPIRE_HOURS = 8

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(hours=EXPIRE_HOURS)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str):
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None

def login_admin(username: str, password: str):
    conn = get_connection()
    row  = conn.execute(
        "SELECT id, username, password_hash FROM admins WHERE username=?", (username,)
    ).fetchone()
    conn.close()
    if not row or not verify_password(password, row["password_hash"]):
        return None
    return create_token({"sub": str(row["id"]), "role": "admin", "name": row["username"]})

def login_faculty(email: str, password: str):
    conn = get_connection()
    row  = conn.execute(
        "SELECT id, name, email, password_hash FROM faculties WHERE email=?", (email,)
    ).fetchone()
    conn.close()
    if not row or not verify_password(password, row["password_hash"]):
        return None
    return create_token({"sub": str(row["id"]), "role": "faculty", "name": row["name"], "email": row["email"]})