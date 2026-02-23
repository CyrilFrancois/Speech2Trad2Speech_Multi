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

### **File Structure Description**

* **`README.md`**
* **`.env`**
* **`docker-compose.yml`**
* **`/backend`**
    * `main.py`
    * `requirements.txt`
    * `Dockerfile`
* **`/frontend`**
    * `index.html`
    * `script.js`
    * `Dockerfile`
* **`/rsc`**
    * `screenshot.png`
    * `background.png`

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


TBD:
- Revert the bubble when on the customer page so the customer bubble are on the right sid (standard like other message app)
- Include a real AI to create real time advices based on the current conv' (emulating a DB with protocols or tickets)
- Breakdown the code: its sarting to be to big, even for a demo
