import insightface
import cv2
import numpy as np
import pickle
import os
from modules.db import add_student, get_all_students

# Paths
ENCODINGS_PATH = os.path.join(os.path.dirname(__file__), '..', 'encodings', 'encodings.pkl')
KNOWN_FACES_PATH = os.path.join(os.path.dirname(__file__), '..', 'known_faces')

# ── Load InsightFace model ───────────────────────────────────────
def load_model():
    app = insightface.app.FaceAnalysis(name='buffalo_l')
    app.prepare(ctx_id=-1, det_size=(640, 640))  # -1 = CPU
    return app

model = load_model()

# ── Encodings file operations ────────────────────────────────────
def load_encodings():
    if os.path.exists(ENCODINGS_PATH):
        with open(ENCODINGS_PATH, 'rb') as f:
            return pickle.load(f)
    return {}  # {roll_no: {"name": ..., "embedding": ..., "student_id": ...}}

def save_encodings(data):
    with open(ENCODINGS_PATH, 'wb') as f:
        pickle.dump(data, f)

# ── Extract embedding from image ─────────────────────────────────
def get_embedding(img):
    """
    Takes a BGR image (numpy array), returns 512-d embedding or None
    """
    faces = model.get(img)
    if len(faces) == 0:
        return None
    if len(faces) > 1:
        # pick the largest face
        faces = sorted(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]), reverse=True)
    return faces[0].embedding  # 512-d numpy array

# ── Register from image file ─────────────────────────────────────
def register_from_image(img, name, roll_no, section='', phone=''):
    """
    img: numpy BGR image
    Returns: (success: bool, message: str)
    """
    embedding = get_embedding(img)
    if embedding is None:
        return False, "❌ No face detected in the image. Try a clearer photo."

    # Save to DB
    student_id = add_student(name, roll_no, section, phone)
    if student_id is None:
        return False, f"❌ Roll number {roll_no} already registered."

    # Save face image
    img_path = os.path.join(KNOWN_FACES_PATH, f"{roll_no}.jpg")
    cv2.imwrite(img_path, img)

    # Save embedding
    encodings = load_encodings()
    encodings[roll_no] = {
        "name": name,
        "student_id": student_id,
        "embedding": embedding
    }
    save_encodings(encodings)

    return True, f"✅ {name} registered successfully!"

# ── Register from webcam ─────────────────────────────────────────
def register_from_webcam(name, roll_no, section='', phone=''):
    """
    Opens webcam, lets user press SPACE to capture, ESC to cancel
    """
    cap = cv2.VideoCapture(0)
    print("📷 Webcam open. Press SPACE to capture, ESC to cancel.")
    captured_img = None

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Draw live face box
        faces = model.get(frame)
        for face in faces:
            x1, y1, x2, y2 = [int(v) for v in face.bbox]
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(frame, "Face Detected", (x1, y1-10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,255,0), 2)

        cv2.putText(frame, "SPACE: Capture | ESC: Cancel", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)
        cv2.imshow("Register Student", frame)

        key = cv2.waitKey(1)
        if key == 27:  # ESC
            print("Registration cancelled.")
            break
        elif key == 32:  # SPACE
            captured_img = frame.copy()
            print("📸 Image captured!")
            break

    cap.release()
    cv2.destroyAllWindows()

    if captured_img is None:
        return False, "Registration cancelled."

    return register_from_image(captured_img, name, roll_no, section, phone)

# ── Rebuild encodings from DB (utility) ─────────────────────────
def rebuild_encodings():
    """
    Re-processes all known_faces images and rebuilds encodings.pkl
    Useful if encodings file gets corrupted or deleted.
    """
    from modules.db import get_all_students
    students = get_all_students()
    encodings = {}
    for s in students:
        img_path = os.path.join(KNOWN_FACES_PATH, f"{s['roll_no']}.jpg")
        if os.path.exists(img_path):
            img = cv2.imread(img_path)
            emb = get_embedding(img)
            if emb is not None:
                encodings[s['roll_no']] = {
                    "name": s['name'],
                    "student_id": s['id'],
                    "embedding": emb
                }
                print(f"✅ Rebuilt: {s['name']}")
            else:
                print(f"⚠️ No face found in image for {s['name']}")
    save_encodings(encodings)
    print(f"\n✅ Rebuilt {len(encodings)} encodings.")

if __name__ == '__main__':
    # Quick test — register via webcam
    name = input("Enter student name: ")
    roll = input("Enter roll number: ")
    section = input("Enter section: ")
    success, msg = register_from_webcam(name, roll, section)
    print(msg)