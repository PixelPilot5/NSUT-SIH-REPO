"""
server.py - launcher.  The API itself lives in main.py (FastAPI app object: `app`).

    cd backend
    python server.py            # http://127.0.0.1:8000  (docs at /docs)

Equivalent to:  uvicorn main:app --reload --port 8000
"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
