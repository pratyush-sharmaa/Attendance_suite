import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from fastapi import APIRouter, HTTPException, Depends
from database import get_connection
from auth import decode_token
from datetime import date, timedelta
from pydantic import BaseModel
from typing import Optional
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

router = APIRouter(prefix="/api/alerts", tags=["Email Alerts"])

# ── Email config — stored in DB settings table ────────────────
def get_email_config():
    conn = get_connection()
    rows = conn.execute("SELECT key, value FROM settings WHERE key IN ('smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from')").fetchall()
    conn.close()
    cfg = {r['key']: r['value'] for r in rows}
    return cfg

def send_email(to_email: str, subject: str, html_body: str, cfg: dict) -> bool:
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From']    = cfg.get('smtp_from', cfg.get('smtp_user', ''))
        msg['To']      = to_email
        msg.attach(MIMEText(html_body, 'html'))

        port = int(cfg.get('smtp_port', 587))
        with smtplib.SMTP(cfg['smtp_host'], port) as server:
            server.ehlo()
            server.starttls()
            server.login(cfg['smtp_user'], cfg['smtp_pass'])
            server.sendmail(msg['From'], [to_email], msg.as_string())
        return True
    except Exception as e:
        print(f"[Email Error] {e}")
        return False

def build_absence_email(student_name: str, section_name: str, absent_dates: list, parent_name: str = "") -> str:
    dates_html = "".join(f"<li style='padding:4px 0;color:#ef4444;'>📅 {d}</li>" for d in absent_dates)
    greeting   = f"Dear {parent_name}," if parent_name else "Dear Parent/Guardian,"
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:40px auto;background:#13131f;border-radius:16px;overflow:hidden;border:1px solid rgba(99,102,241,0.2);">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
          <div style="font-size:40px;margin-bottom:8px;">🎓</div>
          <h1 style="color:white;margin:0;font-size:1.5rem;font-weight:700;">FaceAttend</h1>
          <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:0.875rem;">Attendance Alert System</p>
        </div>

        <!-- Body -->
        <div style="padding:32px;">
          <p style="color:#94a3b8;font-size:1rem;margin:0 0 20px;">{greeting}</p>

          <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:20px;margin-bottom:24px;">
            <h2 style="color:#f87171;margin:0 0 8px;font-size:1.1rem;">⚠️ Absence Alert</h2>
            <p style="color:#cbd5e1;margin:0;font-size:0.9rem;">
              <strong style="color:#e2e8f0;">{student_name}</strong> has been absent from
              <strong style="color:#818cf8;">{section_name}</strong> on the following dates:
            </p>
          </div>

          <ul style="background:rgba(255,255,255,0.03);border-radius:10px;padding:16px 16px 16px 36px;margin:0 0 24px;">
            {dates_html}
          </ul>

          <p style="color:#64748b;font-size:0.875rem;margin:0 0 24px;line-height:1.6;">
            Regular attendance is essential for academic success. Please ensure your ward attends classes regularly.
            If there is a valid reason for absence, kindly inform the faculty.
          </p>

          <div style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:16px;text-align:center;">
            <p style="color:#818cf8;margin:0;font-size:0.8rem;">
              This is an automated message from the FaceAttend system.<br>
              Please do not reply to this email.
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
          <p style="color:#334155;font-size:0.75rem;margin:0;">
            FaceAttend — AI-Powered Attendance System
          </p>
        </div>
      </div>
    </body>
    </html>
    """

# ══════════════════════════════════════════════════════════════
# CONFIGURE EMAIL SETTINGS
# ══════════════════════════════════════════════════════════════
class EmailConfig(BaseModel):
    smtp_host: str
    smtp_port: int = 587
    smtp_user: str
    smtp_pass: str
    smtp_from: Optional[str] = None

@router.post("/configure")
def configure_email(config: EmailConfig):
    conn = get_connection()
    items = [
        ('smtp_host', config.smtp_host),
        ('smtp_port', str(config.smtp_port)),
        ('smtp_user', config.smtp_user),
        ('smtp_pass', config.smtp_pass),
        ('smtp_from', config.smtp_from or config.smtp_user),
    ]
    for key, value in items:
        conn.execute(
            "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=?",
            (key, value, value)
        )
    conn.commit()
    conn.close()
    return {"message": "Email configuration saved"}

@router.get("/config")
def get_config():
    cfg = get_email_config()
    # Don't return password
    return {
        "smtp_host": cfg.get('smtp_host', ''),
        "smtp_port": cfg.get('smtp_port', '587'),
        "smtp_user": cfg.get('smtp_user', ''),
        "smtp_from": cfg.get('smtp_from', ''),
        "configured": bool(cfg.get('smtp_host') and cfg.get('smtp_user'))
    }

# ══════════════════════════════════════════════════════════════
# TEST EMAIL
# ══════════════════════════════════════════════════════════════
class TestEmail(BaseModel):
    to_email: str

@router.post("/test")
def test_email(data: TestEmail):
    cfg = get_email_config()
    if not cfg.get('smtp_host'):
        raise HTTPException(400, "Email not configured yet")
    html = build_absence_email("Test Student", "CS-A", ["2026-02-20", "2026-02-21", "2026-02-22"])
    ok   = send_email(data.to_email, "FaceAttend — Test Email ✅", html, cfg)
    if ok:
        return {"message": f"Test email sent to {data.to_email}"}
    raise HTTPException(500, "Failed to send email. Check SMTP settings.")

# ══════════════════════════════════════════════════════════════
# UPDATE STUDENT PARENT INFO
# ══════════════════════════════════════════════════════════════
class ParentInfo(BaseModel):
    parent_email: str
    parent_name:  Optional[str] = ""
    parent_phone: Optional[str] = ""

@router.put("/student/{student_id}/parent")
def update_parent_info(student_id: int, data: ParentInfo):
    conn = get_connection()
    conn.execute('''
        UPDATE students SET parent_email=?, parent_name=?, parent_phone=?
        WHERE id=?
    ''', (data.parent_email, data.parent_name, data.parent_phone, student_id))
    conn.commit()
    conn.close()
    return {"message": "Parent info updated"}

# ══════════════════════════════════════════════════════════════
# CHECK & SEND ABSENCE ALERTS
# Faculty calls this — checks last N days, sends emails
# ══════════════════════════════════════════════════════════════
@router.post("/check/{section_id}")
def check_and_send_alerts(section_id: int, consecutive_days: int = 3):
    cfg = get_email_config()
    if not cfg.get('smtp_host'):
        raise HTTPException(400, "Email not configured. Go to Settings → Email to set up SMTP.")

    conn    = get_connection()
    today   = date.today()
    results = []

    # Get all students in section with parent emails
    students = conn.execute('''
        SELECT id, name, roll_no, parent_email, parent_name
        FROM students
        WHERE section_id=? AND parent_email IS NOT NULL AND parent_email != ''
    ''', (section_id,)).fetchall()

    section = conn.execute(
        "SELECT name FROM sections WHERE id=?", (section_id,)
    ).fetchone()
    section_name = section['name'] if section else "Unknown"

    for student in students:
        # Check last `consecutive_days` school days
        absent_dates = []
        for i in range(1, consecutive_days + 1):
            check_date = (today - timedelta(days=i)).strftime('%Y-%m-%d')
            record = conn.execute('''
                SELECT id FROM attendance
                WHERE student_id=? AND date=?
            ''', (student['id'], check_date)).fetchone()
            if not record:
                absent_dates.append(check_date)

        # Only alert if ALL checked days are absent
        if len(absent_dates) == consecutive_days:
            absent_dates_sorted = sorted(absent_dates)
            html = build_absence_email(
                student['name'],
                section_name,
                absent_dates_sorted,
                student['parent_name'] or ""
            )
            subject = f"⚠️ Attendance Alert — {student['name']} absent for {consecutive_days} days"
            sent    = send_email(student['parent_email'], subject, html, cfg)

            # Log the alert
            conn.execute('''
                INSERT INTO alert_logs (student_id, section_id, absent_dates, email_sent, sent_to)
                VALUES (?,?,?,?,?)
            ''', (student['id'], section_id, ','.join(absent_dates_sorted), 1 if sent else 0, student['parent_email']))

            results.append({
                "student":      student['name'],
                "roll_no":      student['roll_no'],
                "parent_email": student['parent_email'],
                "absent_dates": absent_dates_sorted,
                "email_sent":   sent
            })

    conn.commit()
    conn.close()

    return {
        "checked":    len(students),
        "alerts_sent": len(results),
        "results":    results
    }

# ══════════════════════════════════════════════════════════════
# GET ALERT LOGS
# ══════════════════════════════════════════════════════════════
@router.get("/logs/{section_id}")
def get_alert_logs(section_id: int):
    conn = get_connection()
    rows = conn.execute('''
        SELECT al.*, s.name as student_name, s.roll_no
        FROM alert_logs al
        JOIN students s ON s.id = al.student_id
        WHERE al.section_id=?
        ORDER BY al.sent_at DESC
        LIMIT 50
    ''', (section_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]