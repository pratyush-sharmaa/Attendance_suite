import subprocess
import sys
import os

def check_dependencies():
    required = ['insightface', 'cv2', 'streamlit', 'pandas', 'PIL']
    missing = []
    for pkg in required:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)
    return missing

def main():
    print("=" * 50)
    print("   🎓 Face Attendance System")
    print("=" * 50)

    # Check deps
    missing = check_dependencies()
    if missing:
        print(f"❌ Missing packages: {missing}")
        print("Run: pip install insightface opencv-python streamlit pandas pillow onnxruntime")
        sys.exit(1)

    # Init DB
    from modules.db import init_db
    init_db()

    print("✅ All checks passed!")
    print("🚀 Starting dashboard at http://localhost:8501")
    print("   Press Ctrl+C to stop\n")

    os.system("streamlit run app.py")

if __name__ == '__main__':
    main()