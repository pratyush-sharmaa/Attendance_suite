import cv2
import os
import numpy as np
from datetime import datetime
from modules.recognize import process_image

CLASSROOM_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'classroom_outputs')

def run_classroom_attendance(image_source, threshold=0.5):
    """
    image_source: file path (str) OR numpy BGR image array
    Returns: (results, annotated_img, summary)
    """
    os.makedirs(CLASSROOM_OUTPUT_PATH, exist_ok=True)

    # Load image
    if isinstance(image_source, str):
        img = cv2.imread(image_source)
        if img is None:
            return [], None, {"error": f"Could not load image from {image_source}"}
    else:
        img = image_source  # already a numpy array (from Streamlit uploader)

    # Run recognition on all faces in image
    results, annotated_img = process_image(img, method='classroom', threshold=threshold)

    # Save annotated output
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_path = os.path.join(CLASSROOM_OUTPUT_PATH, f"attendance_{timestamp}.jpg")
    cv2.imwrite(output_path, annotated_img)

    # Build summary
    present = [r for r in results if r['status'] in ('marked', 'already_marked')]
    unknown = [r for r in results if r['status'] == 'unknown']
    newly_marked = [r for r in results if r['status'] == 'marked']

    summary = {
        'total_faces': len(results),
        'total_identified': len(present),
        'newly_marked': len(newly_marked),
        'already_marked': len(present) - len(newly_marked),
        'unknown_count': len(unknown),
        'output_image_path': output_path,
        'timestamp': timestamp
    }

    return results, annotated_img, summary


def run_classroom_from_webcam_snapshot(threshold=0.5):
    """
    Takes a single snapshot from webcam and runs classroom attendance on it.
    Good for quick single-shot classroom capture.
    """
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    print("📷 Press SPACE to capture classroom photo | ESC to cancel")
    captured = None

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        cv2.putText(frame, "SPACE: Capture Classroom | ESC: Cancel",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        cv2.imshow("Classroom Snapshot", frame)

        key = cv2.waitKey(1)
        if key == 27:
            break
        elif key == 32:
            captured = frame.copy()
            print("📸 Snapshot taken!")
            break

    cap.release()
    cv2.destroyAllWindows()

    if captured is None:
        return [], None, {"error": "Cancelled"}

    results, annotated_img, summary = run_classroom_attendance(captured, threshold)

    # Show result
    cv2.imshow("Classroom Attendance Result", annotated_img)
    print(f"\n{'='*45}")
    print(f"📊 Classroom Attendance Summary")
    print(f"{'='*45}")
    print(f"  Total faces detected : {summary['total_faces']}")
    print(f"  Identified students  : {summary['total_identified']}")
    print(f"  Newly marked         : {summary['newly_marked']}")
    print(f"  Already marked       : {summary['already_marked']}")
    print(f"  Unknown faces        : {summary['unknown_count']}")
    print(f"  Output saved to      : {summary['output_image_path']}")
    print(f"{'='*45}")
    print("\nResults:")
    for r in results:
        icon = "✅" if r['status'] == 'marked' else "🔁" if r['status'] == 'already_marked' else "❓"
        print(f"  {icon} {r['name']} | Roll: {r['roll_no']} | Score: {r['similarity']} | {r['status']}")

    cv2.waitKey(0)
    cv2.destroyAllWindows()
    return results, annotated_img, summary


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        # Test on image: python modules/classroom.py path/to/group_photo.jpg
        results, annotated, summary = run_classroom_attendance(sys.argv[1])
        print(summary)
        if annotated is not None:
            cv2.imshow("Result", annotated)
            cv2.waitKey(0)
            cv2.destroyAllWindows()
    else:
        # Webcam snapshot mode
        run_classroom_from_webcam_snapshot()