import numpy as np
import cv2
import os
import pickle
from datetime import datetime
from modules.register import load_model, load_encodings, get_embedding
from modules.db import mark_attendance, log_unknown

UNKNOWN_FACES_PATH = os.path.join(os.path.dirname(__file__), '..', 'unknown_faces')

# ── Cosine Similarity ────────────────────────────────────────────
def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

# ── Match embedding against known faces ──────────────────────────
def identify_face(embedding, threshold=0.5):
    """
    Compares embedding to all known faces.
    Returns (roll_no, name, student_id, similarity) or ("unknown", ...)
    threshold: minimum cosine similarity to consider a match (0 to 1)
    higher = stricter matching
    """
    encodings = load_encodings()
    if not encodings:
        return "unknown", "Unknown", None, 0.0

    best_match = None
    best_score = -1

    for roll_no, data in encodings.items():
        score = cosine_similarity(embedding, data['embedding'])
        if score > best_score:
            best_score = score
            best_match = (roll_no, data['name'], data['student_id'])

    if best_score >= threshold:
        roll_no, name, student_id = best_match
        return roll_no, name, student_id, best_score
    else:
        return "unknown", "Unknown", None, best_score

# ── Save unknown face snapshot ───────────────────────────────────
def save_unknown_snapshot(img, method='webcam'):
    os.makedirs(UNKNOWN_FACES_PATH, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    path = os.path.join(UNKNOWN_FACES_PATH, f"unknown_{timestamp}.jpg")
    cv2.imwrite(path, img)
    log_unknown(path, method)
    return path

# ── Process a single image (classroom / uploaded photo) ──────────
def process_image(img, method='classroom', threshold=0.5):
    """
    Detects ALL faces in an image.
    Returns list of results:
    [
      {
        'name': ...,
        'roll_no': ...,
        'student_id': ...,
        'similarity': ...,
        'bbox': (x1,y1,x2,y2),
        'status': 'marked' | 'already_marked' | 'unknown'
      },
      ...
    ]
    Also draws boxes on the image and returns annotated image.
    """
    model = load_model()
    faces = model.get(img)
    results = []
    annotated = img.copy()

    for face in faces:
        x1, y1, x2, y2 = [int(v) for v in face.bbox]
        embedding = face.embedding

        roll_no, name, student_id, similarity = identify_face(embedding, threshold)

        if name == "Unknown":
            # Crop and save unknown face
            face_crop = img[max(0,y1):y2, max(0,x1):x2]
            save_unknown_snapshot(face_crop, method)
            color = (0, 0, 255)  # Red for unknown
            label = f"Unknown ({similarity:.2f})"
            status = "unknown"
        else:
            marked = mark_attendance(student_id, method)
            color = (0, 255, 0)   # Green for known
            label = f"{name} ({similarity:.2f})"
            status = "marked" if marked else "already_marked"

        # Draw on image
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        cv2.putText(annotated, label, (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

        results.append({
            'name': name,
            'roll_no': roll_no,
            'student_id': student_id,
            'similarity': round(float(similarity), 3),
            'bbox': (x1, y1, x2, y2),
            'status': status
        })

    return results, annotated

# ── Quick test ───────────────────────────────────────────────────
if __name__ == '__main__':
    import sys

    if len(sys.argv) > 1:
        # Test on image file: python modules/recognize.py path/to/image.jpg
        img_path = sys.argv[1]
        img = cv2.imread(img_path)
        results, annotated = process_image(img, method='test')

        print(f"\n{'='*40}")
        print(f"Faces detected: {len(results)}")
        for r in results:
            print(f"  → {r['name']} | Roll: {r['roll_no']} | Score: {r['similarity']} | Status: {r['status']}")

        cv2.imshow("Result", annotated)
        cv2.waitKey(0)
        cv2.destroyAllWindows()
    else:
        print("Usage: python modules/recognize.py path/to/image.jpg")
        print("Or import process_image() in other modules.")