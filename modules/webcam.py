import cv2
import os
import time
from datetime import datetime
from modules.register import load_model, load_encodings
from modules.recognize import identify_face, save_unknown_snapshot
from modules.db import mark_attendance

# ── Real-time webcam attendance ──────────────────────────────────
def run_webcam_attendance(threshold=0.5, cooldown_seconds=5):
    """
    Opens webcam, recognizes faces in real-time, marks attendance.
    
    threshold: cosine similarity cutoff for match
    cooldown_seconds: prevent same face from being processed repeatedly
    """
    model = load_model()
    
    # Track recently seen faces to avoid duplicate processing
    recently_seen = {}  # {roll_no: last_seen_timestamp}
    
    # Session log — what happened this session
    session_log = []

    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    print("📷 Webcam attendance running. Press Q to quit.")

    # Process every Nth frame for performance
    frame_count = 0
    PROCESS_EVERY = 3  # process every 3rd frame

    last_results = []  # persist boxes between processed frames

    while True:
        ret, frame = cap.read()
        if not ret:
            print("❌ Could not read from webcam.")
            break

        frame_count += 1
        display = frame.copy()

        if frame_count % PROCESS_EVERY == 0:
            faces = model.get(frame)
            last_results = []

            for face in faces:
                x1, y1, x2, y2 = [int(v) for v in face.bbox]
                embedding = face.embedding
                roll_no, name, student_id, similarity = identify_face(embedding, threshold)

                now = time.time()

                if name == "Unknown":
                    color = (0, 0, 255)
                    label = f"Unknown ({similarity:.2f})"
                    status_text = "UNKNOWN"

                    # Save unknown snapshot with cooldown
                    last_unknown = recently_seen.get("unknown", 0)
                    if now - last_unknown > cooldown_seconds * 2:
                        face_crop = frame[max(0,y1):y2, max(0,x1):x2]
                        save_unknown_snapshot(face_crop, method='webcam')
                        recently_seen["unknown"] = now

                else:
                    last_seen = recently_seen.get(roll_no, 0)

                    if now - last_seen > cooldown_seconds:
                        # Try to mark attendance
                        marked = mark_attendance(student_id, method='webcam')
                        recently_seen[roll_no] = now

                        if marked:
                            status_text = "✅ MARKED"
                            color = (0, 255, 0)
                            session_log.append({
                                'name': name,
                                'roll_no': roll_no,
                                'time': datetime.now().strftime('%H:%M:%S'),
                                'status': 'Marked'
                            })
                            print(f"✅ Attendance marked: {name} ({roll_no}) at {datetime.now().strftime('%H:%M:%S')}")
                        else:
                            status_text = "ALREADY MARKED"
                            color = (0, 200, 255)  # Orange
                    else:
                        status_text = "ALREADY MARKED"
                        color = (0, 200, 255)

                    label = f"{name} ({similarity:.2f})"

                last_results.append((x1, y1, x2, y2, label, status_text, color))

        # Draw results on every frame
        for (x1, y1, x2, y2, label, status_text, color) in last_results:
            cv2.rectangle(display, (x1, y1), (x2, y2), color, 2)
            cv2.putText(display, label, (x1, y1 - 25),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)
            cv2.putText(display, status_text, (x1, y1 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)

        # ── Sidebar info panel ───────────────────────────────────
        panel_x = 10
        cv2.putText(display, f"Session Marked: {len(session_log)}", (panel_x, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.putText(display, f"Time: {datetime.now().strftime('%H:%M:%S')}", (panel_x, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
        cv2.putText(display, "Q: Quit", (panel_x, 90),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (100, 100, 255), 1)

        # Show last 5 marked students in corner
        cv2.putText(display, "Recently Marked:", (panel_x, 130),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 0), 1)
        for i, log in enumerate(session_log[-5:]):
            cv2.putText(display, f"  {log['name']} {log['time']}", (panel_x, 155 + i*22),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 180), 1)

        cv2.imshow("Face Attendance - Webcam", display)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    print(f"\n📋 Session Summary: {len(session_log)} students marked")
    for log in session_log:
        print(f"   {log['roll_no']} | {log['name']} | {log['time']}")
    return session_log


if __name__ == '__main__':
    run_webcam_attendance(threshold=0.5, cooldown_seconds=5)