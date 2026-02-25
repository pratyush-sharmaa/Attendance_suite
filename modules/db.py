import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'database', 'attendance.db')

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # lets you access columns by name
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Students table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            roll_no TEXT UNIQUE NOT NULL,
            section TEXT,
            phone TEXT,
            registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Attendance table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            status TEXT DEFAULT 'Present',
            method TEXT DEFAULT 'webcam',
            FOREIGN KEY (student_id) REFERENCES students(id),
            UNIQUE(student_id, date)  -- one entry per student per day
        )
    ''')

    # Unknown faces log
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS unknown_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_path TEXT,
            detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            method TEXT
        )
    ''')

    conn.commit()
    conn.close()
    print("✅ Database initialized successfully!")

# ── Student Operations ──────────────────────────────────────────

def add_student(name, roll_no, section='', phone=''):
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO students (name, roll_no, section, phone) VALUES (?, ?, ?, ?)",
            (name, roll_no, section, phone)
        )
        conn.commit()
        student_id = conn.execute(
            "SELECT id FROM students WHERE roll_no = ?", (roll_no,)
        ).fetchone()['id']
        print(f"✅ Student {name} added with ID {student_id}")
        return student_id
    except sqlite3.IntegrityError:
        print(f"❌ Roll number {roll_no} already exists!")
        return None
    finally:
        conn.close()

def get_all_students():
    conn = get_connection()
    students = conn.execute("SELECT * FROM students ORDER BY name").fetchall()
    conn.close()
    return students

def get_student_by_roll(roll_no):
    conn = get_connection()
    student = conn.execute(
        "SELECT * FROM students WHERE roll_no = ?", (roll_no,)
    ).fetchone()
    conn.close()
    return student

# ── Attendance Operations ────────────────────────────────────────

def mark_attendance(student_id, method='webcam'):
    from datetime import datetime
    date = datetime.now().strftime('%Y-%m-%d')
    time = datetime.now().strftime('%H:%M:%S')
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO attendance (student_id, date, time, method) VALUES (?, ?, ?, ?)",
            (student_id, date, time, method)
        )
        conn.commit()
        return True   # marked successfully
    except sqlite3.IntegrityError:
        return False  # already marked today
    finally:
        conn.close()

def get_attendance_by_date(date):
    conn = get_connection()
    records = conn.execute('''
        SELECT s.name, s.roll_no, s.section, a.time, a.method
        FROM attendance a
        JOIN students s ON a.student_id = s.id
        WHERE a.date = ?
        ORDER BY a.time
    ''', (date,)).fetchall()
    conn.close()
    return records

def get_student_attendance_summary():
    conn = get_connection()
    summary = conn.execute('''
        SELECT s.name, s.roll_no, s.section,
               COUNT(a.id) as total_present
        FROM students s
        LEFT JOIN attendance a ON s.id = a.student_id
        GROUP BY s.id
        ORDER BY s.name
    ''').fetchall()
    conn.close()
    return summary

# ── Unknown Logs ─────────────────────────────────────────────────

def log_unknown(snapshot_path, method='webcam'):
    conn = get_connection()
    conn.execute(
        "INSERT INTO unknown_logs (snapshot_path, method) VALUES (?, ?)",
        (snapshot_path, method)
    )
    conn.commit()
    conn.close()

def get_unknown_logs():
    conn = get_connection()
    logs = conn.execute(
        "SELECT * FROM unknown_logs ORDER BY detected_at DESC LIMIT 50"
    ).fetchall()
    conn.close()
    return logs

def get_attendance_all_dates():
    conn = get_connection()
    records = conn.execute('''
        SELECT a.date, COUNT(a.id) as count
        FROM attendance a
        GROUP BY a.date
        ORDER BY a.date DESC
    ''').fetchall()
    conn.close()
    return records

def delete_student(student_id):
    conn = get_connection()
    conn.execute("DELETE FROM attendance WHERE student_id = ?", (student_id,))
    conn.execute("DELETE FROM students WHERE id = ?", (student_id,))
    conn.commit()
    conn.close()    

if __name__ == '__main__':
    init_db()