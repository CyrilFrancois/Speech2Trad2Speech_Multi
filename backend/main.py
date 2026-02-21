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

# Global status for real-time synchronization across all tabs
app.state.is_processing = False
app.state.active_sender = None
app.state.partial_text = ""

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
stt_model = WhisperModel("small", device=device, compute_type=compute_type)
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

@app.post("/transcribe")
def handle_transcription(file: UploadFile = File(...), sender: str = Form(...)):
    """PHASE 1: Audio to Text (Updates global state for all pages)"""
    app.state.is_processing = True
    app.state.active_sender = sender
    app.state.partial_text = "... Transcribing ..."
    
    logger.info(f"--- START TRANSCRIPTION for {sender} ---")
    
    file_path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4()}.wav")
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        segments_gen, info = stt_model.transcribe(file_path, beam_size=5)
        transcription = " ".join([s.text for s in list(segments_gen)]).strip()
        
        # Update state so other tabs see what was said immediately
        app.state.partial_text = transcription
        logger.info(f"DONE TRANSCRIPTION: '{transcription}' (Lang: {info.language})")
        
        return {"transcription": transcription, "detected_lang": info.language}
    except Exception as e:
        logger.error(f"TRANSCRIPTION_ERROR: {e}")
        app.state.is_processing = False
        return {"error": str(e)}
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@app.post("/translate_only")
def handle_translation(
    text: str = Form(...), 
    target_lang: str = Form(...), 
    sender: str = Form(...)
):
    """PHASE 2: Text to Translation & Final Save"""
    # Ensure dots stay visible during this second call
    app.state.is_processing = True 
    app.state.active_sender = sender
    app.state.partial_text = text # Keep the original text visible
    
    logger.info(f"--- START TRANSLATION for {sender} ---")
    
    try:
        src_lang = "en" if sender == "customer" else "fr"
        translation = translate_text(text, src_lang, target_lang) if src_lang != target_lang else text
        
        new_entry = {
            "id": str(uuid.uuid4())[:8],
            "sender": sender,
            "original": text,
            "translated": translation,
            "timestamp": time.time()
        }
        
        history = load_history()
        history.append(new_entry)
        save_history(history)
        
        logger.info(f"DONE TRANSLATION: '{translation}'")
        return new_entry
    except Exception as e:
        logger.error(f"TRANSLATION_ERROR: {e}")
        return {"error": str(e)}
    finally:
        # Crucial: Reset global state so dots disappear on all pages
        app.state.is_processing = False
        app.state.active_sender = None
        app.state.partial_text = ""

@app.get("/history")
async def get_history():
    """Polled by all clients every second to sync dots and messages."""
    return {
        "history": load_history(),
        "is_processing": app.state.is_processing,
        "active_sender": app.state.active_sender,
        "partial_text": app.state.partial_text
    }

@app.delete("/history")
async def clear_history():
    if os.path.exists(HISTORY_FILE):
        os.remove(HISTORY_FILE)
    logger.info("HISTORY_CLEARED")
    return {"status": "cleared"}