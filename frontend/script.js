/**
 * AI Translation Bridge - Logic v2.6
 * Features: Transcription-First Display, Global Dot Sync, Adaptive Colors
 */

const API_BASE = `http://${window.location.hostname}:8000`;
let mediaRecorder = null;
let audioChunks = [];
const knownMessageIds = new Set();
let lastPlayedId = null; 

const getElems = () => ({
    recordBtn: document.getElementById('recordBtn'),
    textInput: document.getElementById('textInput'),
    messagesContainer: document.getElementById('messages-container'),
    userRoleSelect: document.getElementById('userRole'),
    resetBtn: document.getElementById('resetBtn'),
    chatWindow: document.getElementById('chat-window'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text')
});

// --- 1. TTS ENGINE ---
function speak(text, lang, id = null) {
    if (!window.speechSynthesis || !text) return;
    if (id && lastPlayedId === id) return;
    if (id) lastPlayedId = id;

    const voiceMap = { 'en': 'en-US', 'fr': 'fr-FR' };
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voiceMap[lang] || lang;
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
}

// --- 2. GLOBAL LOADING INDICATOR (The Three Dots) ---
function toggleGlobalLoading(show, sender = 'customer', partialText = "") {
    const existing = document.getElementById('global-loading');
    const ui = getElems();
    
    if (show) {
        const isCustomer = sender === 'customer';
        const colorClass = isCustomer ? 'loading-customer' : 'loading-advisor';
        
        // If it exists, we just update the content (for transcription display)
        if (existing) {
            const label = existing.querySelector('.neural-label');
            if (partialText && label) {
                label.innerText = partialText; // Show the transcription as it arrives
                label.classList.remove('opacity-70', 'uppercase', 'text-[8px]');
                label.classList.add('text-[11px]', 'font-bold', 'normal-case', 'opacity-100');
            }
            return;
        }

        const html = `
            <div id="global-loading" class="flex ${isCustomer ? 'justify-start' : 'justify-end'} mb-6 w-full animate-fade-in">
                <div class="flex flex-col ${isCustomer ? 'items-start' : 'items-end'} max-w-[85%]">
                    <div class="flex ${isCustomer ? 'flex-row' : 'flex-row-reverse'} items-center">
                        <div class="p-3 rounded-2xl bg-white/80 backdrop-blur-sm shadow-sm border ${isCustomer ? 'border-orange-100' : 'border-slate-200'} ${colorClass}">
                            <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
                            <span class="neural-label text-[8px] ml-2 uppercase font-black tracking-widest opacity-70">Neural Processing</span>
                        </div>
                    </div>
                </div>
            </div>`;
        ui.messagesContainer.insertAdjacentHTML('beforeend', html);
        scrollToBottom();
    } else if (!show && existing) {
        existing.remove();
    }
}

// --- 3. INPUT PROCESSING ---
async function processInput(data, isAudio) {
    const ui = getElems();
    const urlParams = new URLSearchParams(window.location.search);
    const activeRole = urlParams.get('role') || ui.userRoleSelect.value;
    const targetLang = (activeRole === 'customer') ? 'fr' : 'en';

    document.getElementById('empty-state')?.remove();
    
    const formData = new FormData();
    if (isAudio) {
        formData.append('file', data, 'recording.wav');
    } else {
        formData.append('text', data);
    }
    
    formData.append('target_lang', targetLang);
    formData.append('sender', activeRole);

    try {
        // We don't wait for the result here because syncHistory (the interval) 
        // will pick up the "processing" state and transcription from the backend
        fetch(`${API_BASE}/translate`, { method: 'POST', body: formData });
    } catch (err) {
        window.logToUI?.("Network error", "ERROR");
    }
}

// --- 4. SYNC LOGIC ---
async function syncHistory() {
    const ui = getElems();
    try {
        const res = await fetch(`${API_BASE}/history`);
        const data = await res.json();
        
        // Sync Global Dots and Transcription Status
        toggleGlobalLoading(data.is_processing, data.active_sender, data.partial_text);

        ui.statusDot.style.backgroundColor = "#10b981";
        ui.statusText.innerText = "Neural Sync Active";

        const history = data.history || [];
        if (history.length > 0) document.getElementById('empty-state')?.remove();

        // Clear UI if history was deleted on backend
        if (history.length === 0 && knownMessageIds.size > 0) {
            ui.messagesContainer.innerHTML = '';
            knownMessageIds.clear();
        }

        const urlParams = new URLSearchParams(window.location.search);
        const pageRole = urlParams.get('role') || ui.userRoleSelect.value;

        history.forEach(entry => {
            if (!knownMessageIds.has(entry.id)) {
                renderMessage(entry);
                knownMessageIds.add(entry.id);

                // Auto-TTS for the receiver
                if (pageRole !== entry.sender) {
                    const ttsLang = (entry.sender === 'customer') ? 'fr' : 'en';
                    speak(entry.translated, ttsLang, entry.id);
                }
            }
        });
    } catch (err) {
        ui.statusDot.style.backgroundColor = "#f87171";
        ui.statusText.innerText = "Offline";
    }
}

// --- 5. RENDERING ---
function renderMessage(entry) {
    const ui = getElems();
    const isCustomer = entry.sender === 'customer';
    const ttsLang = isCustomer ? 'fr' : 'en';

    // Bubble Styles: Orange left border for customer, Dark Grey right border for advisor
    const bubbleClass = isCustomer 
        ? "bg-white text-slate-800 rounded-bl-none border-l-4 border-orange-500 shadow-md" 
        : "bg-slate-900 text-white rounded-br-none border-r-4 border-slate-700 shadow-lg";

    const ttsBtn = `
        <button onclick="speak('${entry.translated.replace(/'/g, "\\'")}', '${ttsLang}')" 
                class="mt-1 flex items-center space-x-1 opacity-60 hover:opacity-100 transition-all duration-200">
            <div class="p-1 rounded-full bg-orange-100 text-orange-600">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
            </div>
            <span class="text-[8px] font-bold uppercase tracking-tighter">Listen AI</span>
        </button>
    `;

    const html = `
        <div class="flex ${isCustomer ? 'justify-start' : 'justify-end'} mb-6 w-full animate-fade-in">
            <div class="flex flex-col ${isCustomer ? 'items-start' : 'items-end'} max-w-[85%]">
                <div class="flex ${isCustomer ? 'flex-row' : 'flex-row-reverse'} items-end mb-1">
                    <div class="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-[8px] font-black text-white mx-2 shadow-sm ${isCustomer ? 'bg-orange-500' : 'bg-slate-600'}">
                        ${isCustomer ? 'C' : 'A'}
                    </div>
                    <div class="p-3 md:p-4 rounded-2xl ${bubbleClass}">
                        <span class="block opacity-40 text-[9px] mb-1 font-bold uppercase tracking-widest">${entry.original}</span>
                        <span class="block font-semibold text-sm leading-relaxed">${entry.translated}</span>
                    </div>
                </div>
                <div class="${isCustomer ? 'ml-10' : 'mr-10'}">
                    ${ttsBtn}
                </div>
            </div>
        </div>`;

    // Ensure the message appears above the loading dots if they are present
    const dots = document.getElementById('global-loading');
    if (dots) {
        dots.insertAdjacentHTML('beforebegin', html);
    } else {
        ui.messagesContainer.insertAdjacentHTML('beforeend', html);
    }
    
    scrollToBottom();
}

function scrollToBottom() {
    const win = getElems().chatWindow;
    if (win) win.scrollTop = win.scrollHeight;
}

// --- 6. VOICE RECORDING ---
async function handleRecordClick() {
    const ui = getElems();
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        ui.recordBtn.classList.remove('rec-pulse');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const blob = new Blob(audioChunks, { type: 'audio/wav' });
            processInput(blob, true);
        };
        mediaRecorder.start();
        ui.recordBtn.classList.add('rec-pulse');
    } catch (err) {
        window.logToUI?.("Mic access error", "ERROR");
    }
}

// --- 7. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const ui = getElems();
    
    syncHistory();
    // Fast polling (1s) ensures the transcription appears quickly after speech
    setInterval(syncHistory, 1000);

    if (ui.recordBtn) ui.recordBtn.onclick = handleRecordClick;
    
    if (ui.resetBtn) ui.resetBtn.onclick = async () => {
        if (confirm("Reset conversation?")) {
            await fetch(`${API_BASE}/history`, { method: 'DELETE' });
            syncHistory();
        }
    };

    if (ui.textInput) {
        ui.textInput.onkeypress = (e) => {
            if (e.key === 'Enter' && ui.textInput.value.trim() !== "") {
                processInput(ui.textInput.value, false);
                ui.textInput.value = "";
            }
        };
    }
});