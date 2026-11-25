# SmartPark AI — Local MVP

A ready-to-run local parking management MVP for Windows:
- React + Vite frontend
- FastAPI backend
- SQLite database (created automatically)
- Four seeded parking lots and one camera per lot
- Editable parking slots, occupancy controls, parking sessions and fee calculation
- MP4 upload and in-browser video preview for each lot

## Requirements
- Python 3.10+ (Python 3.11 or 3.12 recommended)
- Node.js 18+

## 1. Start backend (Windows CMD)
Open CMD:
```bat
cd /d D:\Project\smartpark-ai\backend
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --reload
```
Backend: http://127.0.0.1:8000
Swagger: http://127.0.0.1:8000/docs

## 2. Start frontend
Open a SECOND CMD window:
```bat
cd /d D:\Project\smartpark-ai\frontend
npm install
npm run dev
```
Frontend: http://localhost:5173

Keep both CMD windows open.

## What happens on first run?
The backend creates `backend/data/smartpark.db` and seeds:
- LOT-01 / CAM-01
- LOT-02 / CAM-02
- LOT-03 / CAM-03
- LOT-04 / CAM-04

Each lot starts with 6 example slots. These are editable demo records, NOT automatically discovered from a video. Delete/add slots or change occupancy in the UI to match the actual camera view.

Uploaded videos are stored under `backend/uploads/lot_01` ... `lot_04`.

## Important AI note
This package is a complete working management MVP, but it does not pretend to have trained or calibrated a parking-space detector. Reliable occupancy detection needs the actual camera video and per-camera parking-space polygons. The optional `requirements-ai.txt` lists OpenCV and Ultralytics for the next AI integration step. The base app runs without downloading large AI weights.

## Reset demo data
Stop backend, delete `backend/data/smartpark.db`, then start backend again. This resets the four lots and sample slots. Uploaded videos are not deleted.
