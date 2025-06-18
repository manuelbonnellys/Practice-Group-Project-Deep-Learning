from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import uuid
import os
import numpy as np
import torch
import cv2
from facenet_pytorch import MTCNN, InceptionResnetV1
from typing import Optional

app = FastAPI()

# Allow CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

enroll_tokens = set()  # In-memory store for demo

# Model and DB setup
DEVICE = torch.device('cuda:0' if torch.cuda.is_available() else 'cpu')
REFS_DIR = os.path.join(os.path.dirname(__file__), '..', 'refs')
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'ref_db.npy')
THRESHOLD = 0.65

mtcnn = MTCNN(image_size=160, margin=14, post_process=True, device=DEVICE)
embedder = InceptionResnetV1(pretrained='vggface2').eval().to(DEVICE)

def load_ref_db():
    if os.path.exists(DB_PATH):
        ref_db = np.load(DB_PATH, allow_pickle=True).item()
        return {k: torch.tensor(v).to(DEVICE) for k, v in ref_db.items()}
    return {}

def save_ref_db(ref_db):
    np.save(DB_PATH, {k: v.cpu().detach().numpy() for k, v in ref_db.items()})

ref_db = load_ref_db()

@app.post("/unlock")
async def unlock(image: UploadFile = File(...)):
    contents = await image.read()
    npimg = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
    if frame is None:
        return JSONResponse(status_code=400, content={"error": "Invalid image"})
    face = mtcnn(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    if face is None:
        return {"status": "fail", "user": None, "score": 0.0}
    vec = embedder(face.unsqueeze(0).to(DEVICE))[0]
    vec = vec / vec.norm()
    if not ref_db:
        return {"status": "fail", "user": None, "score": 0.0}
    name, score = max(
        ((n, float(torch.dot(vec, e))) for n, e in ref_db.items()),
        key=lambda t: t[1]
    )
    if score > THRESHOLD:
        return {"status": "ok", "user": name, "score": score}
    else:
        return {"status": "fail", "user": None, "score": score}

@app.post("/generate_enroll_link")
async def generate_enroll_link():
    token = str(uuid.uuid4())
    enroll_tokens.add(token)
    return {"enroll_link": f"/enroll/{token}", "token": token}

@app.post("/enroll/{token}")
async def enroll(token: str, name: str = Form(...), image: UploadFile = File(...)):
    if token not in enroll_tokens:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    contents = await image.read()
    npimg = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
    if frame is None:
        return JSONResponse(status_code=400, content={"error": "Invalid image"})
    face = mtcnn(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    if face is None:
        return JSONResponse(status_code=400, content={"error": "No face detected"})
    vec = embedder(face.unsqueeze(0).to(DEVICE))[0]
    vec = vec / vec.norm()
    # Save image to refs/
    os.makedirs(REFS_DIR, exist_ok=True)
    img_path = os.path.join(REFS_DIR, f"{name}.jpg")
    cv2.imwrite(img_path, frame)
    # Update ref_db
    ref_db[name] = vec.cpu()
    save_ref_db(ref_db)
    enroll_tokens.remove(token)
    return {"status": "enrolled", "name": name} 