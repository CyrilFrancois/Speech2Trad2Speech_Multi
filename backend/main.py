import os
import shutil
import torch
import logging
import uuid
import json
import time
from typing import Optional, List, Dict
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer

# --- LOGGING SETUP ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)
logger = logging.getLogger("bridge-backend")

app = FastAPI(title="Multilingual Bridge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- STATE & PERSISTENCE ---
HISTORY_FILE = "conversation_history.json"
UPLOAD_DIR = "temp_audio"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Global status to sync the "Three Dots" across all interface windows
app.state.is_processing = False
app.state.current_sender = None

def load_history() -> List[Dict]:
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"DISK_READ_ERROR: {e}")
            return []
    return []

def save_history(history: List[Dict]):
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"DISK_WRITE_ERROR: {e}")

# --- MODEL LOADING ---
device = "cuda" if torch.cuda.is_available() else "cpu"
compute_type = "float16" if device == "cuda" else "int8"

logger.info(f"SYSTEM: Loading Models on {device} ({compute_type})...")

# STT Model (Whisper)
stt_model = WhisperModel("small", device=device, compute_type=compute_type)

# Translation Model (M2M100)
model_name = "facebook/m2m100_418M"
tokenizer = M2M100Tokenizer.from_pretrained(model_name)
translation_model = M2M100ForConditionalGeneration.from_pretrained(model_name).to(device)

logger.info("SYSTEM: Models ready.")

def translate_text(text: str, src_lang: str, trg_lang: str):
    tokenizer.src_lang = src_lang
    encoded_input = tokenizer(text, return_tensors="pt").to(device)
    generated_tokens = translation_model.generate(
        **encoded_input, 
        forced_bos_token_id=tokenizer.get_lang_id(trg_lang)
    )
    return tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)[0]

# --- ROUTES ---

@app.post("/translate")
async def process_translation(
    file: Optional[UploadFile] = File(None), 
    text: Optional[str] = Form(None),
    target_lang: str = Form(...),
    sender: str = Form(...)
):
    # 1. Set global processing state IMMEDIATELY
    app.state.is_processing = True
    app.state.current_sender = sender
    
    logger.info(f"TRANSLATION_REQ: From {sender} to {target_lang}")
    
    transcription = ""
    src_lang = "en" if sender == "customer" else "fr"

    try:
        # Audio Processing
        if file:
            file_path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4()}.wav")
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            segments_gen, info = stt_model.transcribe(file_path, beam_size=5)
            transcription = " ".join([s.text for s in list(segments_gen)]).strip()
            
            # Detect source language if confidence is high
            if info.language_probability > 0.8:
                src_lang = info.language
            
            if os.path.exists(file_path): 
                os.remove(file_path)
        
        # Text Processing
        elif text:
            transcription = text.strip()

        if not transcription:
            return {"error": "No input detected"}

        # Perform Translation
        translation = translate_text(transcription, src_lang, target_lang) if src_lang != target_lang else transcription
        
        new_entry = {
            "id": str(uuid.uuid4())[:8],
            "sender": sender,
            "original": transcription,
            "translated": translation,
            "timestamp": time.time()
        }
        
        # Save to Shared History
        history = load_history()
        history.append(new_entry)
        save_history(history)

        return new_entry

    except Exception as e:
        logger.error(f"PROCESS_ERROR: {str(e)}")
        return {"error": "failed", "details": str(e)}
    
    finally:
        # 2. Reset state after processing is finished (Success or Error)
        app.state.is_processing = False
        app.state.current_sender = None

@app.get("/history")
async def get_history():
    """Returns history AND the current global processing status for UI sync."""
    return {
        "history": load_history(),
        "is_processing": app.state.is_processing,
        "active_sender": app.state.current_sender
    }

@app.delete("/history")
async def clear_history():
    if os.path.exists(HISTORY_FILE):
        os.remove(HISTORY_FILE)
    return {"status": "cleared"}

@app.get("/health")
async def health():
    return {"status": "ready", "device": device}