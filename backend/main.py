import os
import shutil
import torch
import logging
import uuid
import json
import asyncio
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel
from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("speech2translate-backend")

app = FastAPI(title="Multilingual Bridge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- HARDWARE DETECTION ---
device = "cuda" if torch.cuda.is_available() else "cpu"
# For 'small' model, int8 is great for CPU, float16 is best for GPU
compute_type = "float16" if device == "cuda" else "int8"

# --- MODEL LOADING ---
logger.info(f"Initializing Acoustic Intelligence (Whisper Small) on {device}...")
# Switched "base" -> "small"
stt_model = WhisperModel("small", device=device, compute_type=compute_type)

logger.info("Initializing Linguistic Engine (M2M100)...")
model_name = "facebook/m2m100_418M"
tokenizer = M2M100Tokenizer.from_pretrained(model_name)
translation_model = M2M100ForConditionalGeneration.from_pretrained(model_name).to(device)

UPLOAD_DIR = "temp_audio"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- CORE LOGIC ---

def translate_text(text: str, src_lang: str, trg_lang: str):
    tokenizer.src_lang = src_lang
    # Move tensors to the same device as the model
    encoded_input = tokenizer(text, return_tensors="pt").to(device)
    generated_tokens = translation_model.generate(
        **encoded_input, 
        forced_bos_token_id=tokenizer.get_lang_id(trg_lang)
    )
    return tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)[0]

@app.post("/translate")
async def process_speech_to_speech(
    file: Optional[UploadFile] = File(None), 
    text: Optional[str] = Form(None),
    target_lang: str = Form(...)
):
    async def stream_results():
        transcription = ""
        detected_lang = "en"

        # 1. Handle Input & Transcription
        if file:
            session_id = str(uuid.uuid4())
            file_path = os.path.join(UPLOAD_DIR, f"{session_id}_{file.filename}")
            try:
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)

                # beam_size=5 is good for 'small' to maintain accuracy
                segments, info = stt_model.transcribe(file_path, beam_size=5, vad_filter=True)
                
                # Using a list comprehension for cleaner joining
                text_segments = [segment.text for segment in segments]
                transcription = " ".join(text_segments).strip()
                detected_lang = info.language
                
                logger.info(f"Detected language: {detected_lang} with probability {info.language_probability:.2f}")

            finally:
                if os.path.exists(file_path):
                    os.remove(file_path)
        elif text:
            transcription = text
            # Fallback logic if no file provided
            detected_lang = "en" 
        else:
            yield json.dumps({"error": "No input provided"}) + "\n"
            return

        # 2. POP TRANSCRIPTION IMMEDIATELY
        if transcription:
            logger.info(f"Transcription ready: {transcription}")
            yield json.dumps({
                "type": "transcription", 
                "text": transcription,
                "detected_lang": detected_lang
            }) + "\n"
        else:
            yield json.dumps({"type": "error", "text": "No speech detected."}) + "\n"
            return

        # 3. RUN TRANSLATION
        try:
            translation = translate_text(transcription, detected_lang, target_lang)
            logger.info(f"Translation ready: {translation}")
            yield json.dumps({
                "type": "translation", 
                "text": translation
            }) + "\n"
        except Exception as e:
            logger.error(f"Translation Error: {e}")
            yield json.dumps({"type": "error", "text": f"Translation failed: {str(e)}"}) + "\n"

    return StreamingResponse(stream_results(), media_type="application/x-ndjson")

@app.get("/health")
async def health():
    return {
        "status": "ready",
        "model": "whisper-small",
        "device": device
    }