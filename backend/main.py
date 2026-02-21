import os
import shutil
import torch
import logging
import uuid
import json
from typing import Optional, List, Dict
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel
from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer

# --- LOGGING SETUP ---
# We use a specific format to make logs stand out in the terminal
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

# --- PERSISTENCE LOGIC ---
HISTORY_FILE = "conversation_history.json"
UPLOAD_DIR = "temp_audio"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def load_history() -> List[Dict]:
    """Loads history from JSON file. Logged every time a page polls."""
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                # logger.info(f"DISK_READ: Loaded {len(data)} messages from {HISTORY_FILE}")
                return data
        except Exception as e:
            logger.error(f"DISK_READ_ERROR: Could not read {HISTORY_FILE}: {e}")
            return []
    return []

def save_history(history: List[Dict]):
    """Saves history to JSON file. Logged every time a new message is processed."""
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
        logger.info(f"DISK_WRITE: History updated. Total messages: {len(history)}")
    except Exception as e:
        logger.error(f"DISK_WRITE_ERROR: {e}")

# Global state (backup)
conversation_history = load_history()

# --- MODEL LOADING ---
device = "cuda" if torch.cuda.is_available() else "cpu"
compute_type = "float16" if device == "cuda" else "int8"

logger.info(f"SYSTEM: Loading Models on {device}...")
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

# --- CHANGE THIS ROUTE IN main.py ---

@app.post("/translate")
async def process_speech_to_speech(
    file: Optional[UploadFile] = File(None), 
    text: Optional[str] = Form(None),
    target_lang: str = Form(...),
    sender: str = Form("customer") 
):
    logger.info(f"INPUT_RECEIVED: From {sender} targeting {target_lang}")
    
    transcription = ""
    detected_lang = "en" if sender == "customer" else "fr"

    try:
        if file:
            file_path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4()}.wav")
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            segments_gen, info = stt_model.transcribe(file_path, beam_size=5)
            segments = list(segments_gen)
            transcription = " ".join([s.text for s in segments]).strip()
            detected_lang = info.language
            if os.path.exists(file_path): os.remove(file_path)
            
        elif text:
            transcription = text.strip()

        if not transcription:
            return {"error": "Empty input"}

        # Perform Translation
        translation = translate_text(transcription, detected_lang, target_lang)
        
        # --- PERSISTENCE ---
        new_entry = {
            "id": str(uuid.uuid4())[:8],
            "sender": sender,
            "original": transcription,
            "translated": translation
        }
        
        history = load_history()
        history.append(new_entry)
        save_history(history)

        return new_entry # Return a simple JSON object

    except Exception as e:
        logger.error(f"PROCESS_ERROR: {e}")
        return {"error": str(e)}

@app.get("/history")
async def get_history():
    """Polled by script.js every second."""
    history = load_history()
    # Log this occasionally or it will flood the terminal. 
    # Log only if history is not empty to see active syncs.
    if len(history) > 0:
        logger.debug(f"SYNC_REQUEST: Serving {len(history)} messages to a frontend tab.")
    return {"history": history}

@app.delete("/history")
async def clear_history():
    global conversation_history
    logger.warning("CLEANUP: Deleting history file and clearing memory.")
    conversation_history = []
    if os.path.exists(HISTORY_FILE):
        os.remove(HISTORY_FILE)
    return {"status": "cleared"}

@app.get("/health")
async def health():
    return {"status": "ready"}