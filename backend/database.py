import sqlite3
import os

BASE_DIR = os.path.join(os.path.dirname(__file__), '..', 'database')
os.makedirs(BASE_DIR, exist_ok=True)
DB_PATH  = os.path.join(BASE_DIR, 'attendance.db')

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_connection()

    # ── Core tables ───────────────────────────────────────────
    conn.execute('''
        CREATE TABLE IF NOT EXISTS admins (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS faculties (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            email         TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            department    TEXT DEFAULT '',
            created_at    TEXT DEFAULT (datetime('now'))
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS sections (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            department TEXT DEFAULT '',
            faculty_id INTEGER NOT NULL,
            FOREIGN KEY (faculty_id) REFERENCES faculties(id) ON DELETE CASCADE
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS students (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            roll_no       TEXT UNIQUE NOT NULL,
            section_id    INTEGER NOT NULL,
            phone         TEXT DEFAULT '',
            parent_email  TEXT DEFAULT '',
            parent_name   TEXT DEFAULT '',
            parent_phone  TEXT DEFAULT '',
            registered_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS attendance (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            section_id INTEGER NOT NULL,
            faculty_id INTEGER NOT NULL,
            date       TEXT NOT NULL,
            time       TEXT NOT NULL,
            method     TEXT DEFAULT 'webcam',
            UNIQUE(student_id, date),
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS unknown_logs (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_path TEXT,
            faculty_id    INTEGER,
            section_id    INTEGER,
            method        TEXT DEFAULT 'webcam',
            detected_at   TEXT DEFAULT (datetime('now'))
        )
    ''')

    # ── NEW: Settings table (email config etc) ─────────────────
    conn.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')

    # ── NEW: Alert logs ────────────────────────────────────────
    conn.execute('''
        CREATE TABLE IF NOT EXISTS alert_logs (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id    INTEGER NOT NULL,
            section_id    INTEGER NOT NULL,
            absent_dates  TEXT NOT NULL,
            email_sent    INTEGER DEFAULT 0,
            sent_to       TEXT,
            sent_at       TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        )
    ''')

    conn.commit()

    # ── Migrate existing students table if needed ──────────────
    # Add parent columns if they don't exist yet
    existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(students)").fetchall()]
    for col, defval in [
        ('parent_email', "''"),
        ('parent_name',  "''"),
        ('parent_phone', "''"),
    ]:
        if col not in existing_cols:
            conn.execute(f"ALTER TABLE students ADD COLUMN {col} TEXT DEFAULT {defval}")
    conn.commit()

    # ── Default admin ──────────────────────────────────────────
    from auth import hash_password
    existing = conn.execute("SELECT id FROM admins WHERE username='admin'").fetchone()
    if not existing:
        conn.execute(
            "INSERT INTO admins (username, password_hash) VALUES (?,?)",
            ('admin', hash_password('admin123'))
        )
        conn.commit()
        print("✅ Default admin created → username: admin | password: admin123")

    conn.close()
    print("✅ Database initialized!")

if __name__ == "__main__":
    init_db()