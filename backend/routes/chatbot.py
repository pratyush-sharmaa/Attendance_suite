import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from fastapi import APIRouter, HTTPException
from database import get_connection
from pydantic import BaseModel
from typing import Optional
import httpx
import json
import re

router = APIRouter(prefix="/api/chat", tags=["AI Chatbot"])

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"
MODEL        = "llama-3.3-70b-versatile"

# ── Safe SQL executor ─────────────────────────────────────────
BLOCKED = ['drop', 'delete', 'update', 'insert', 'alter', 'create', 'truncate', 'pragma']

def run_sql(sql: str):
    sql_clean = sql.strip().rstrip(';')
    sql_lower = sql_clean.lower()
    for word in BLOCKED:
        if re.search(rf'\b{word}\b', sql_lower):
            raise ValueError(f"Blocked SQL operation: {word}")
    if not sql_lower.startswith('select'):
        raise ValueError("Only SELECT queries allowed")
    conn = get_connection()
    try:
        cur     = conn.execute(sql_clean)
        columns = [d[0] for d in cur.description]
        rows    = cur.fetchmany(50)
        return [dict(zip(columns, row)) for row in rows]
    finally:
        conn.close()

def get_db_context():
    conn = get_connection()
    try:
        sections  = conn.execute("SELECT COUNT(*) as c FROM sections").fetchone()['c']
        students  = conn.execute("SELECT COUNT(*) as c FROM students").fetchone()['c']
        faculties = conn.execute("SELECT COUNT(*) as c FROM faculties").fetchone()['c']
        att_days  = conn.execute("SELECT COUNT(DISTINCT date) as c FROM attendance").fetchone()['c']
        today_att = conn.execute("SELECT COUNT(*) as c FROM attendance WHERE date=date('now')").fetchone()['c']
        sec_list  = conn.execute("""
            SELECT s.id, s.name, s.faculty_id, f.name as faculty_name
            FROM sections s JOIN faculties f ON f.id=s.faculty_id
        """).fetchall()
        return {
            "sections": sections, "students": students,
            "faculties": faculties, "total_class_days": att_days,
            "today_attendance": today_att,
            "section_list": [dict(r) for r in sec_list]
        }
    finally:
        conn.close()

# ── Pydantic model ────────────────────────────────────────────
class ChatMessage(BaseModel):
    message:      str
    history:      Optional[list] = []
    faculty_id:   Optional[int]  = None
    faculty_name: Optional[str]  = None
    role:         Optional[str]  = "faculty"

# ── Main chat endpoint ────────────────────────────────────────
@router.post("/message")
async def chat_message(body: ChatMessage):
    if not GROQ_API_KEY:
        raise HTTPException(400, "GROQ_API_KEY not set. Add it via the chat widget settings.")
    if not body.message.strip():
        raise HTTPException(400, "Empty message")

    db_ctx = get_db_context()

    # Build identity context
    if body.faculty_id and body.role == 'faculty':
        identity_ctx = f"""CURRENT USER: {body.faculty_name or 'Faculty'} (faculty_id = {body.faculty_id})
IMPORTANT: When user says "me", "my", "I" → always filter WHERE faculty_id = {body.faculty_id}
- "my sections"  → WHERE s.faculty_id = {body.faculty_id}
- "my students"  → JOIN sections sec ON sec.id=s.section_id WHERE sec.faculty_id = {body.faculty_id}
- "my attendance"→ WHERE a.faculty_id = {body.faculty_id}"""
    else:
        identity_ctx = "CURRENT USER: Admin (access to all data)"

    # ── STEP 1: Ask LLM to produce ONLY a SQL query ───────────
    sql_system = f"""You are a SQL generator for a college attendance system SQLite database.

DATABASE SCHEMA:
- faculties(id, name, email, department)
- sections(id, name, department, faculty_id)
- students(id, name, roll_no, section_id, phone, parent_email, registered_at)
- attendance(id, student_id, section_id, faculty_id, date TEXT 'YYYY-MM-DD', time TEXT, method)

{identity_ctx}

DB STATS: {db_ctx['faculties']} faculties, {db_ctx['sections']} sections, {db_ctx['students']} students, {db_ctx['total_class_days']} class days recorded
Sections: {json.dumps(db_ctx['section_list'], default=str)}

RULES:
- Respond with ONLY a valid SQLite SELECT statement — nothing else, no explanation, no markdown
- Always JOIN students table when student names are needed
- For attendance %, use: ROUND(COUNT(a.id) * 100.0 / NULLIF(total_days.cnt,0), 1)
- Always include student name (s.name) and roll number (s.roll_no) when listing students
- Use date('now') for today
- If the question cannot be answered with SQL (e.g. "hello"), respond with exactly: NO_SQL

Example output format:
SELECT s.name, s.roll_no FROM students s JOIN sections sec ON sec.id=s.section_id WHERE sec.faculty_id = 2"""

    sql_messages = [{"role": "system", "content": sql_system}]
    # Add recent history for context
    for h in (body.history or [])[-4:]:
        sql_messages.append({"role": h["role"], "content": h["content"]})
    sql_messages.append({"role": "user", "content": body.message})

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r1 = await client.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json={"model": MODEL, "messages": sql_messages, "temperature": 0.0, "max_tokens": 400}
            )
        r1.raise_for_status()
        sql_raw = r1.json()['choices'][0]['message']['content'].strip()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            raise HTTPException(400, "Invalid Groq API key. Click ⚙️ to update it.")
        raise HTTPException(500, f"Groq API error: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(500, f"LLM request failed: {str(e)}")

    # ── STEP 2: Execute SQL ───────────────────────────────────
    query_data = []
    sql_used   = ""
    sql_error  = ""

    if sql_raw.strip().upper() != "NO_SQL":
        # Extract just the SELECT statement — strip any accidental text
        sql_match = re.search(r'(SELECT\b.+)', sql_raw, re.IGNORECASE | re.DOTALL)
        if sql_match:
            # Take only up to first semicolon or end
            raw_sql = sql_match.group(1)
            sql_used = raw_sql.split(';')[0].strip()
            try:
                query_data = run_sql(sql_used)
            except Exception as e:
                sql_error = str(e)

    # ── STEP 3: Ask LLM to write a friendly answer ────────────
    if sql_error:
        result_info = f"SQL failed: {sql_error}. Answer based on your knowledge of the database stats."
    elif sql_used and not query_data:
        result_info = "The SQL query returned 0 results."
    elif query_data:
        result_info = f"SQL returned {len(query_data)} rows: {json.dumps(query_data[:20], default=str)}"
    else:
        result_info = "No SQL was needed for this question."

    answer_system = f"""You are AttendAI, a friendly attendance assistant for a college portal.
{identity_ctx}
Answer the user's question in a clear, friendly, concise way based on the data provided.
- Use actual names and numbers from the data
- Keep it conversational, 1-3 sentences max unless listing items
- Do NOT mention SQL, JSON, or technical details
- If listing students/sections, format as a clean numbered or bulleted list"""

    answer_messages = [
        {"role": "system", "content": answer_system},
        {"role": "user",   "content": f"Question: {body.message}\n\nData: {result_info}"}
    ]

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r2 = await client.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json={"model": MODEL, "messages": answer_messages, "temperature": 0.3, "max_tokens": 500}
            )
        r2.raise_for_status()
        answer = r2.json()['choices'][0]['message']['content'].strip()
    except Exception:
        # Fallback — build answer from data directly
        if query_data:
            answer = f"Found {len(query_data)} result(s)."
        else:
            answer = "I couldn't fetch that data right now. Please try again."

    return {
        "answer":    answer,
        "data":      query_data,
        "sql_used":  sql_used,
        "row_count": len(query_data)
    }

# ── Suggestions ───────────────────────────────────────────────
@router.get("/suggestions")
def get_suggestions():
    return {"suggestions": [
        "Which students have less than 75% attendance?",
        "Who has the best attendance this month?",
        "Show today's attendance summary",
        "Which section has the highest attendance?",
        "Students who have never attended",
        "How many classes has each faculty marked?",
    ]}

# ── Config ────────────────────────────────────────────────────
@router.get("/config")
def get_chat_config():
    return {"configured": bool(GROQ_API_KEY), "model": MODEL}

class GroqConfig(BaseModel):
    api_key: str

@router.post("/configure")
def configure_groq(data: GroqConfig):
    global GROQ_API_KEY
    GROQ_API_KEY = data.api_key
    conn = get_connection()
    conn.execute(
        "INSERT INTO settings (key,value) VALUES ('groq_api_key',?) ON CONFLICT(key) DO UPDATE SET value=?",
        (data.api_key, data.api_key)
    )
    conn.commit()
    conn.close()
    return {"message": "Groq API key saved!"}

# ── Load key from DB on startup ───────────────────────────────
def load_groq_key():
    global GROQ_API_KEY
    if not GROQ_API_KEY:
        try:
            conn = get_connection()
            row  = conn.execute("SELECT value FROM settings WHERE key='groq_api_key'").fetchone()
            conn.close()
            if row:
                GROQ_API_KEY = row['value']
        except Exception:
            pass

load_groq_key()