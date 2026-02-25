import streamlit as st
import cv2
import numpy as np
import pandas as pd
import os
import pickle
from datetime import datetime, date
from PIL import Image

from modules.db import (
    init_db, get_all_students, get_attendance_by_date,
    get_student_attendance_summary, mark_attendance,
    get_unknown_logs, get_attendance_all_dates, delete_student
)
from modules.register import register_from_image, load_encodings, save_encodings
from modules.recognize import process_image
from modules.classroom import run_classroom_attendance

# ── Page Config ──────────────────────────────────────────────────
st.set_page_config(
    page_title="Face Attendance System",
    page_icon="🎓",
    layout="wide"
)

# ── Init DB ──────────────────────────────────────────────────────
init_db()

# ── Custom CSS ───────────────────────────────────────────────────
st.markdown("""
<style>
    /* Main background */
    .stApp { background-color: #0f0f1a; }

    /* Metric cards */
    .metric-card {
        background: #1e1e2e;
        padding: 20px;
        border-radius: 12px;
        text-align: center;
        border: 1px solid #313244;
        margin-bottom: 10px;
    }
    .metric-number {
        font-size: 2.5rem;
        font-weight: bold;
        color: #cba6f7;
    }
    .metric-label {
        color: #a6adc8;
        font-size: 0.9rem;
        margin-top: 4px;
    }

    /* Status badges */
    .badge-marked {
        background: #1a3a2a;
        color: #a6e3a1;
        padding: 3px 10px;
        border-radius: 20px;
        font-size: 0.8rem;
        font-weight: bold;
    }
    .badge-unknown {
        background: #3a1a1a;
        color: #f38ba8;
        padding: 3px 10px;
        border-radius: 20px;
        font-size: 0.8rem;
        font-weight: bold;
    }
    .badge-already {
        background: #3a2a1a;
        color: #fab387;
        padding: 3px 10px;
        border-radius: 20px;
        font-size: 0.8rem;
        font-weight: bold;
    }

    /* Sidebar */
    section[data-testid="stSidebar"] {
        background-color: #1e1e2e;
        border-right: 1px solid #313244;
    }

    /* Dividers */
    hr { border-color: #313244; }

    /* Unknown face cards */
    .unknown-card {
        background: #2a1a1e;
        border: 1px solid #f38ba8;
        border-radius: 10px;
        padding: 10px;
        text-align: center;
        margin-bottom: 10px;
    }
</style>
""", unsafe_allow_html=True)

# ── Sidebar ──────────────────────────────────────────────────────
st.sidebar.markdown("## 🎓 Face Attendance")
st.sidebar.markdown("---")

page = st.sidebar.radio("Navigate", [
    "📊 Dashboard",
    "✍️ Register Student",
    "📷 Webcam Attendance",
    "🖼️ Classroom Image",
    "📋 Attendance Records",
    "👥 Student List",
    "🚨 Unknown Faces"
])

st.sidebar.markdown("---")
st.sidebar.markdown("**⚙️ Settings**")
threshold = st.sidebar.slider(
    "Recognition Threshold", 0.3, 0.9, 0.5, 0.05,
    help="Higher = stricter. Lower = more lenient. Default 0.5 works well."
)
st.sidebar.markdown(f"Current: `{threshold}` → {'Strict' if threshold > 0.65 else 'Balanced' if threshold > 0.45 else 'Lenient'}")
st.sidebar.markdown("---")
st.sidebar.caption("Built with InsightFace + Streamlit")


# ════════════════════════════════════════════════════════════════
# PAGE 1 — DASHBOARD
# ════════════════════════════════════════════════════════════════
if page == "📊 Dashboard":
    st.title("📊 Attendance Dashboard")
    st.markdown(f"📅 **{datetime.now().strftime('%A, %d %B %Y  |  %I:%M %p')}**")
    st.markdown("---")

    # Load data
    students      = get_all_students()
    today_str     = date.today().strftime('%Y-%m-%d')
    today_records = get_attendance_by_date(today_str)
    unknown_logs  = get_unknown_logs()
    absent        = len(students) - len(today_records)
    pct           = round((len(today_records) / len(students) * 100) if students else 0, 1)

    # Top metrics
    c1, c2, c3, c4, c5 = st.columns(5)
    with c1:
        st.markdown(f"""<div class="metric-card">
            <div class="metric-number">{len(students)}</div>
            <div class="metric-label">Total Students</div>
        </div>""", unsafe_allow_html=True)
    with c2:
        st.markdown(f"""<div class="metric-card">
            <div class="metric-number" style="color:#a6e3a1">{len(today_records)}</div>
            <div class="metric-label">Present Today</div>
        </div>""", unsafe_allow_html=True)
    with c3:
        st.markdown(f"""<div class="metric-card">
            <div class="metric-number" style="color:#f38ba8">{absent}</div>
            <div class="metric-label">Absent Today</div>
        </div>""", unsafe_allow_html=True)
    with c4:
        st.markdown(f"""<div class="metric-card">
            <div class="metric-number" style="color:#89b4fa">{pct}%</div>
            <div class="metric-label">Attendance Rate</div>
        </div>""", unsafe_allow_html=True)
    with c5:
        st.markdown(f"""<div class="metric-card">
            <div class="metric-number" style="color:#fab387">{len(unknown_logs)}</div>
            <div class="metric-label">Unknown Alerts</div>
        </div>""", unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    col_left, col_right = st.columns([3, 2])

    with col_left:
        st.subheader("✅ Today's Present Students")
        if today_records:
            df = pd.DataFrame([dict(r) for r in today_records])
            df.columns = ['Name', 'Roll No', 'Section', 'Time', 'Method']
            st.dataframe(df, use_container_width=True, hide_index=True)
        else:
            st.info("No attendance marked yet today.")

        # Attendance history chart
        st.subheader("📈 Attendance History (All Days)")
        all_dates = get_attendance_all_dates()
        if all_dates:
            df_dates = pd.DataFrame([dict(d) for d in all_dates])
            df_dates.columns = ['Date', 'Count']
            df_dates = df_dates.sort_values('Date')
            st.bar_chart(df_dates.set_index('Date')['Count'])
        else:
            st.info("No attendance history yet.")

    with col_right:
        st.subheader("📊 Student Attendance Summary")
        summary = get_student_attendance_summary()
        if summary:
            df_s = pd.DataFrame([dict(s) for s in summary])
            df_s.columns = ['Name', 'Roll No', 'Section', 'Total Present']
            st.dataframe(df_s[['Name', 'Roll No', 'Total Present']],
                         use_container_width=True, hide_index=True)

        # Absent today list
        if students and today_records:
            present_rolls = {r['roll_no'] for r in today_records}
            absent_students = [s for s in students if s['roll_no'] not in present_rolls]
            if absent_students:
                st.subheader("❌ Absent Today")
                for s in absent_students:
                    st.markdown(f"- {s['name']} ({s['roll_no']})")


# ════════════════════════════════════════════════════════════════
# PAGE 2 — REGISTER STUDENT
# ════════════════════════════════════════════════════════════════
elif page == "✍️ Register Student":
    st.title("✍️ Register New Student")
    st.markdown("---")

    col1, col2 = st.columns([1, 1])

    with col1:
        st.subheader("📝 Student Details")
        name    = st.text_input("Full Name *")
        roll_no = st.text_input("Roll Number *")
        section = st.text_input("Section / Class")
        phone   = st.text_input("Phone Number")

        st.subheader("📸 Face Photo")
        source = st.radio("Photo Source", ["Upload Image", "Capture from Webcam"])

        img_array = None

        if source == "Upload Image":
            uploaded = st.file_uploader("Upload a clear front-facing photo", type=['jpg','jpeg','png'])
            if uploaded:
                pil_img   = Image.open(uploaded).convert('RGB')
                img_array = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
                st.image(pil_img, caption="Uploaded Photo", width=260)

        elif source == "Capture from Webcam":
            captured = st.camera_input("Take a photo")
            if captured:
                pil_img   = Image.open(captured).convert('RGB')
                img_array = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

    with col2:
        st.subheader("✅ Register")
        st.markdown("<br>", unsafe_allow_html=True)

        if st.button("🎓 Register Student", type="primary", use_container_width=True):
            if not name or not roll_no:
                st.error("❌ Name and Roll Number are required!")
            elif img_array is None:
                st.error("❌ Please provide a face photo!")
            else:
                with st.spinner("Extracting face embedding..."):
                    success, msg = register_from_image(img_array, name, roll_no, section, phone)
                if success:
                    st.success(msg)
                    st.balloons()
                else:
                    st.error(msg)

        st.markdown("---")
        st.subheader("📋 Already Registered")
        students = get_all_students()
        st.metric("Total Students", len(students))
        if students:
            df = pd.DataFrame([dict(s) for s in students])
            st.dataframe(
                df[['name', 'roll_no', 'section', 'registered_at']],
                use_container_width=True,
                hide_index=True
            )


# ════════════════════════════════════════════════════════════════
# PAGE 3 — WEBCAM ATTENDANCE
# ════════════════════════════════════════════════════════════════
elif page == "📷 Webcam Attendance":
    st.title("📷 Webcam Attendance")
    st.markdown("---")

    st.info("📌 Capture a photo using the camera below. The system will recognize the face and mark attendance automatically.")

    col1, col2 = st.columns([2, 1])

    with col1:
        img_input = st.camera_input("Point camera at student and capture")

        if img_input:
            pil_img   = Image.open(img_input).convert('RGB')
            img_array = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

            with st.spinner("🔍 Recognizing face..."):
                results, annotated = process_image(img_array, method='webcam', threshold=threshold)

            annotated_rgb = cv2.cvtColor(annotated, cv2.COLOR_BGR2RGB)
            st.image(annotated_rgb, caption="Recognition Result", use_container_width=True)

            st.markdown("### 📋 Results")
            if results:
                for r in results:
                    if r['status'] == 'marked':
                        st.success(f"✅ **{r['name']}** (Roll: {r['roll_no']}) — Attendance Marked! | Score: `{r['similarity']}`")
                    elif r['status'] == 'already_marked':
                        st.warning(f"🔁 **{r['name']}** (Roll: {r['roll_no']}) — Already marked today | Score: `{r['similarity']}`")
                    else:
                        st.error(f"❓ Unknown Face Detected | Score: `{r['similarity']}` | Snapshot saved")
            else:
                st.warning("⚠️ No faces detected. Try better lighting or move closer.")

    with col2:
        st.subheader("📅 Today's Attendance")
        today_str = date.today().strftime('%Y-%m-%d')
        records   = get_attendance_by_date(today_str)
        total     = len(get_all_students())

        st.metric("Present", f"{len(records)} / {total}")
        st.markdown("---")
        if records:
            for r in records:
                st.markdown(f"✅ **{r['name']}**")
                st.caption(f"   {r['roll_no']} | {r['time']}")
        else:
            st.info("No attendance yet today.")


# ════════════════════════════════════════════════════════════════
# PAGE 4 — CLASSROOM IMAGE
# ════════════════════════════════════════════════════════════════
elif page == "🖼️ Classroom Image":
    st.title("🖼️ Classroom Image Attendance")
    st.markdown("---")

    st.info("📌 Upload a group photo of your classroom. All faces will be detected and attendance marked at once.")

    uploaded = st.file_uploader("Upload Classroom Photo", type=['jpg', 'jpeg', 'png'])

    if uploaded:
        pil_img   = Image.open(uploaded).convert('RGB')
        img_array = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

        col_prev, col_btn = st.columns([3, 1])
        with col_prev:
            st.image(pil_img, caption="Uploaded Classroom Photo", use_container_width=True)
        with col_btn:
            st.markdown("<br><br>", unsafe_allow_html=True)
            run_btn = st.button("🚀 Process Attendance", type="primary", use_container_width=True)

        if run_btn:
            with st.spinner("Detecting and recognizing all faces..."):
                results, annotated, summary = run_classroom_attendance(img_array, threshold)

            # Annotated result
            annotated_rgb = cv2.cvtColor(annotated, cv2.COLOR_BGR2RGB)
            st.image(annotated_rgb, caption="✅ Annotated Result", use_container_width=True)

            # Summary metrics
            st.markdown("### 📊 Summary")
            m1, m2, m3, m4 = st.columns(4)
            m1.metric("Total Faces",   summary['total_faces'])
            m2.metric("Identified",    summary['total_identified'])
            m3.metric("Newly Marked",  summary['newly_marked'])
            m4.metric("Unknown Faces", summary['unknown_count'])

            # Results breakdown
            st.markdown("### 📋 Detailed Results")
            for r in results:
                if r['status'] == 'marked':
                    st.success(f"✅ **{r['name']}** | Roll: {r['roll_no']} | Score: `{r['similarity']}`")
                elif r['status'] == 'already_marked':
                    st.warning(f"🔁 **{r['name']}** | Roll: {r['roll_no']} | Score: `{r['similarity']}` — Already marked")
                else:
                    st.error(f"❓ Unknown Face | Score: `{r['similarity']}` | Snapshot saved to unknown_faces/")

            st.caption(f"💾 Annotated image saved: {summary.get('output_image_path', 'N/A')}")


# ════════════════════════════════════════════════════════════════
# PAGE 5 — ATTENDANCE RECORDS
# ════════════════════════════════════════════════════════════════
elif page == "📋 Attendance Records":
    st.title("📋 Attendance Records")
    st.markdown("---")

    col1, col2, col3 = st.columns([2, 1, 1])
    with col1:
        selected_date = st.date_input("📅 Select Date", value=date.today())
    with col2:
        st.markdown("<br>", unsafe_allow_html=True)
        export_btn = st.button("📥 Export CSV", use_container_width=True)
    with col3:
        st.markdown("<br>", unsafe_allow_html=True)
        st.markdown("")  # spacer

    date_str = selected_date.strftime('%Y-%m-%d')
    records  = get_attendance_by_date(date_str)
    students = get_all_students()

    # Metrics
    m1, m2, m3 = st.columns(3)
    m1.metric("Present",    len(records))
    m2.metric("Absent",     len(students) - len(records))
    m3.metric("Total",      len(students))

    st.markdown("---")

    if records:
        df = pd.DataFrame([dict(r) for r in records])
        df.columns = ['Name', 'Roll No', 'Section', 'Time', 'Method']
        st.dataframe(df, use_container_width=True, hide_index=True)

        if export_btn:
            csv = df.to_csv(index=False)
            st.download_button(
                label="⬇️ Download CSV File",
                data=csv,
                file_name=f"attendance_{date_str}.csv",
                mime="text/csv"
            )

        # Absent list
        present_rolls  = {r['roll_no'] for r in records}
        absent_list    = [s for s in students if s['roll_no'] not in present_rolls]
        if absent_list:
            with st.expander(f"❌ Absent Students ({len(absent_list)})"):
                for s in absent_list:
                    st.markdown(f"- **{s['name']}** ({s['roll_no']}) — {s['section']}")
    else:
        st.info(f"No attendance records found for {date_str}")
        if export_btn:
            st.warning("Nothing to export — no records for this date.")


# ════════════════════════════════════════════════════════════════
# PAGE 6 — STUDENT LIST
# ════════════════════════════════════════════════════════════════
elif page == "👥 Student List":
    st.title("👥 Registered Students")
    st.markdown("---")

    students = get_all_students()
    summary  = get_student_attendance_summary()

    if not students:
        st.info("No students registered yet. Go to ✍️ Register Student to add students.")
    else:
        # Search
        search = st.text_input("🔍 Search by name or roll number")

        df = pd.DataFrame([dict(s) for s in summary])
        df.columns = ['Name', 'Roll No', 'Section', 'Total Present']

        if search:
            df = df[
                df['Name'].str.contains(search, case=False) |
                df['Roll No'].str.contains(search, case=False)
            ]

        st.dataframe(df, use_container_width=True, hide_index=True)
        st.metric("Total Registered Students", len(students))

        # Face photos grid
        st.markdown("---")
        st.subheader("🖼️ Registered Face Photos")
        cols = st.columns(5)
        for i, student in enumerate(students):
            img_path = f"known_faces/{student['roll_no']}.jpg"
            with cols[i % 5]:
                if os.path.exists(img_path):
                    st.image(img_path, caption=student['name'], width=120)
                else:
                    st.markdown("🚫 No photo")
                    st.caption(student['name'])

        # Delete student
        st.markdown("---")
        st.subheader("⚠️ Remove Student")
        st.warning("This will permanently delete the student and all their attendance records.")

        student_names = [f"{s['name']} ({s['roll_no']})" for s in students]
        to_delete     = st.selectbox("Select student to remove", ["-- Select --"] + student_names)

        if to_delete != "-- Select --":
            roll    = to_delete.split("(")[-1].replace(")", "").strip()
            student = next((s for s in students if s['roll_no'] == roll), None)

            if student:
                col_warn, col_btn = st.columns([3, 1])
                with col_warn:
                    st.markdown(f"Selected: **{student['name']}** | Roll: `{student['roll_no']}` | Section: `{student['section']}`")
                with col_btn:
                    if st.button(f"🗑️ Confirm Delete", type="secondary", use_container_width=True):
                        # Delete from DB
                        delete_student(student['id'])

                        # Delete face image
                        img_path = f"known_faces/{student['roll_no']}.jpg"
                        if os.path.exists(img_path):
                            os.remove(img_path)

                        # Remove from encodings
                        encodings = load_encodings()
                        if roll in encodings:
                            del encodings[roll]
                            save_encodings(encodings)

                        st.success(f"✅ {student['name']} has been removed from the system.")
                        st.rerun()


# ════════════════════════════════════════════════════════════════
# PAGE 7 — UNKNOWN FACES
# ════════════════════════════════════════════════════════════════
elif page == "🚨 Unknown Faces":
    st.title("🚨 Unknown Faces Log")
    st.markdown("---")
    st.info("These are faces that were detected but could not be matched to any registered student.")

    logs = get_unknown_logs()

    # Metrics
    m1, m2 = st.columns(2)
    m1.metric("Total Unknown Detections", len(logs))
    webcam_count = sum(1 for l in logs if l['method'] == 'webcam')
    m2.metric("Via Webcam / Classroom", f"{webcam_count} / {len(logs) - webcam_count}")

    st.markdown("---")

    if not logs:
        st.success("✅ No unknown faces detected yet! All detected faces matched registered students.")
    else:
        # Filter by method
        method_filter = st.selectbox("Filter by method", ["All", "webcam", "classroom", "test"])
        filtered_logs = logs if method_filter == "All" else [l for l in logs if l['method'] == method_filter]

        st.markdown(f"Showing **{len(filtered_logs)}** records")
        st.markdown("---")

        if filtered_logs:
            cols = st.columns(4)
            for i, log in enumerate(filtered_logs):
                path = log['snapshot_path']
                with cols[i % 4]:
                    if path and os.path.exists(path):
                        st.image(path, width=150)
                    else:
                        st.markdown("🖼️ *(image missing)*")
                    st.caption(f"🕐 {log['detected_at']}")
                    st.caption(f"📍 {log['method']}")
                    st.markdown("---")
        else:
            st.info(f"No unknown faces found for method: {method_filter}")