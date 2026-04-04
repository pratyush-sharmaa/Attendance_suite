import os

TURSO_URL   = os.environ.get("TURSO_DATABASE_URL", "")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "")

if TURSO_URL and TURSO_TOKEN:
    import libsql_experimental as libsql

    class TursoRow:
        def __init__(self, row, description):
            self._data = {}
            self._list = []
            if row is not None and description:
                self._list = list(row)
                self._data = {description[i][0]: row[i] for i in range(len(description))}

        def __getitem__(self, key):
            if isinstance(key, int):
                return self._list[key]
            return self._data[key]

        def __contains__(self, key):
            return key in self._data

        def keys(self):
            return self._data.keys()

        def get(self, key, default=None):
            return self._data.get(key, default)

        def __iter__(self):
            return iter(self._list)

    class TursoCursor:
        def __init__(self, raw_cursor):
            self._cursor = raw_cursor
            self.description = raw_cursor.description or []

        def fetchone(self):
            row = self._cursor.fetchone()
            if row is None:
                return None
            return TursoRow(row, self.description)

        def fetchall(self):
            rows = self._cursor.fetchall()
            return [TursoRow(r, self.description) for r in rows]

    class TursoConnection:
        def __init__(self):
            self._conn = libsql.connect(TURSO_URL, auth_token=TURSO_TOKEN)

        def execute(self, sql, params=()):
            # libsql requires tuple, not list
            raw = self._conn.execute(sql, tuple(params))
            return TursoCursor(raw)

        def commit(self):
            self._conn.commit()

        def close(self):
            pass  # keep connection alive

    def get_connection():
        return TursoConnection()

else:
    import sqlite3
    BASE_DIR = os.path.join(os.path.dirname(__file__), '..', 'database')
    os.makedirs(BASE_DIR, exist_ok=True)
    DB_PATH = os.path.join(BASE_DIR, 'attendance.db')

    def get_connection():
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn


def init_db():
    conn = get_connection()

    conn.execute('''CREATE TABLE IF NOT EXISTS admins (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
    )''')

    conn.execute('''CREATE TABLE IF NOT EXISTS faculties (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        department    TEXT DEFAULT '',
        created_at    TEXT DEFAULT (datetime('now'))
    )''')

    conn.execute('''CREATE TABLE IF NOT EXISTS sections (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        department TEXT DEFAULT '',
        faculty_id INTEGER NOT NULL,
        FOREIGN KEY (faculty_id) REFERENCES faculties(id) ON DELETE CASCADE
    )''')

    conn.execute('''CREATE TABLE IF NOT EXISTS students (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL,
        roll_no       TEXT UNIQUE NOT NULL,
        section_id    INTEGER NOT NULL,
        phone         TEXT DEFAULT '',
        parent_email  TEXT DEFAULT '',
        parent_name   TEXT DEFAULT '',
        parent_phone  TEXT DEFAULT '',
        photo_url     TEXT DEFAULT '',
        registered_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
    )''')

    conn.execute('''CREATE TABLE IF NOT EXISTS attendance (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        section_id INTEGER NOT NULL,
        faculty_id INTEGER NOT NULL,
        date       TEXT NOT NULL,
        time       TEXT NOT NULL,
        method     TEXT DEFAULT 'webcam',
        UNIQUE(student_id, date),
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )''')

    conn.execute('''CREATE TABLE IF NOT EXISTS unknown_logs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_path TEXT,
        faculty_id    INTEGER,
        section_id    INTEGER,
        method        TEXT DEFAULT 'webcam',
        detected_at   TEXT DEFAULT (datetime('now'))
    )''')

    conn.execute('''CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )''')

    conn.execute('''CREATE TABLE IF NOT EXISTS alert_logs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id   INTEGER NOT NULL,
        section_id   INTEGER NOT NULL,
        absent_dates TEXT NOT NULL,
        email_sent   INTEGER DEFAULT 0,
        sent_to      TEXT,
        sent_at      TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )''')

    conn.execute('''CREATE TABLE IF NOT EXISTS face_encodings (
        roll_no    TEXT PRIMARY KEY,
        name       TEXT,
        student_id INTEGER,
        section_id INTEGER,
        embedding  TEXT,
        photo_url  TEXT DEFAULT ''
    )''')

    conn.commit()

    # ── Migrations: add missing columns ───────────────────────
    for col, defval in [
        ('parent_email', "''"),
        ('parent_name',  "''"),
        ('parent_phone', "''"),
        ('photo_url',    "''"),
    ]:
        try:
            conn.execute(f"ALTER TABLE students ADD COLUMN {col} TEXT DEFAULT {defval}")
            conn.commit()
        except Exception:
            pass  # already exists — safe to ignore

    # ── Default admin ─────────────────────────────────────────
    from auth import hash_password
    try:
        existing = conn.execute(
            "SELECT id FROM admins WHERE username='admin'"
        ).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO admins (username, password_hash) VALUES (?,?)",
                ('admin', hash_password('admin123'))
            )
            conn.commit()
            print("✅ Default admin created → username: admin | password: admin123")
    except Exception as e:
        print(f"⚠️ Admin init error: {e}")

    conn.close()
    print("✅ Database initialized!")


if __name__ == "__main__":
    init_db()
