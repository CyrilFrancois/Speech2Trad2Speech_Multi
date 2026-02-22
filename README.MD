# Speech2Translate | AI Multilingual Bridge (v2.8 Sync)

### **What is this project?**
Speech2Translate is a high-performance translation bridge designed for real-time customer service environments. This repository serves as a **Technical Showcase** of a "Cascaded" AI pipeline, demonstrating that high-accuracy, private translation is achievable through localized models with real-time multi-device synchronization.

<p align="center">
  <img src="frontend/rsc/screenshot.png" alt="Speech2Translate UI Screenshot" width="800">
</p>

---

## Showcase Scope & Experience
This prototype demonstrates a modular, containerized microservices architecture capable of handling the core linguistic challenges of international customer support through a unique **Sequential-Sync** approach:

1.  **Phase 1: Acoustic Intelligence (Faster-Whisper):** Near-human transcription accuracy. The system broadcasts "Partial Text" to all connected clients immediately after the audio is processed, providing instant visual feedback.
2.  **Phase 2: Linguistic Fluidity (M2M100):** A "Many-to-Many" multilingual model that translates directly between languages without English-pivot bias.
3.  **Phase 3: Neural Synchronization:** A state-managed backend that ensures "Three-Dot" typing indicators and processing status are synchronized across all instances (Customer, Advisor, and Main Hub) via high-frequency polling.

---

## Technical Innovation: Sequential Sync
Unlike standard translation apps that wait for the entire process to finish before showing anything, this version splits the pipeline:
* **Decoupled Processing:** Transcription and Translation are separate calls.
* **Non-Blocking Backend:** Uses threaded standard Python definitions in FastAPI to ensure the `/history` sync endpoint remains responsive while the GPU is under load.
* **Dual-State UI:** Displays the original transcription in a "pending" state before the translation arrives, significantly improving perceived latency.

---

## Project Architecture
The system is orchestrated via Docker to ensure environment parity between development and production.

### **File Structure**
* **`main.py`** (FastAPI): Threaded handlers for Transcription and Translation; global state management for sync.
* **`index.html`** (Tailwind CSS): Responsive UI with integrated neural processing indicators and real-time debug console.
* **`script.js`** (Vanilla JS): Sequential fetch logic and Web MediaRecorder implementation.
* **`conversation_history.json`** (Persistence): JSON-based store for cross-session continuity.

---

## Getting Started
1.  **Environment Setup:** Ensure your `.env` is configured for your local hardware (CPU/GPU).
2.  **Deployment:** ```bash
    docker-compose up --build
    ```
3.  **Access Points:**
    * **Main Hub:** `http://localhost/index.html` (Desktop/Manager view)
    * **Customer View:** `http://localhost/index.html?role=customer` (EN Input)
    * **Advisor View:** `http://localhost/index.html?role=advisor` (FR Input)

4.  **Monitoring:** Click the **"View Logs"** button in the footer to watch the Phase 1/Phase 2 handshake in real-time.


- I'ld like to have written on top of the conv' the title Customer or Advisor dedpending on the page and nothing in the main hub.

- I'ld like for the button go change page at the top to be hidden but only revealed when hoovering it.

- I'ld like for the customer to bubble to be reversed so on the customer pages, its bubble are show on the left side, which is a common standard now.

- I'ld like to add AI to suggest what to asnwer: a side right block where the AI (GPT) will analyse the conv and offer suggestion on what to answer: differently for Customer and Advisor, nothing in the main. But for both I want the area and when a message is transcrypted (before it is translated) it is send a to the back wich gonna just pass the conv plus a context specifif to customer of advisor (I'll write them later, but now I'll want a filler).