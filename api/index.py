import sys
import os

# Ensure backend and project root are in sys.path
_current_dir = os.path.dirname(os.path.abspath(__file__))
_root_dir = os.path.abspath(os.path.join(_current_dir, ".."))
_backend_dir = os.path.join(_root_dir, "backend")

if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
if _root_dir not in sys.path:
    sys.path.insert(0, _root_dir)

# Import the Flask application instance
from backend.app import app

# Vercel Serverless Function entrypoint
if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5001)
