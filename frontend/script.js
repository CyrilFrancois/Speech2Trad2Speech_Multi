/**
 * AI Translation Bridge - Logic v2.4
 * Features: Auto-TTS, External Play Button, Corrected Bubble Colors, Global Sync
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
    
    // Prevent double auto-play for the same message ID
    if (id && lastPlayedId === id) return;
    if (id) lastPlayedId = id;

    const voiceMap = { 'en': 'en-US', 'fr': 'fr-FR' };
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voiceMap[lang] || lang;
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
}

// --- 2. GLOBAL LOADING INDICATOR (The Three Dots) ---
function toggleGlobalLoading(show, sender = 'customer') {
    const existing = document.getElementById('global-loading');
    if (show && !existing) {
        const isCustomer = sender === 'customer';
        const html = `
            <div id="global-loading" class="flex ${isCustomer ? 'justify-start' : 'justify-end'} mb-6 w-full animate-fade-in">
                <div class="flex ${isCustomer ? 'flex-row' : 'flex-row-reverse'} items-center">
                    <div class="p-3 rounded-2xl bg-white/80 backdrop-blur-sm text-orange-500 shadow-sm border border-orange-100">
                        <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
                        <span class="text-[8px] ml-2 uppercase font-black tracking-widest opacity-70">Neural Processing</span>
                    </div>
                </div>
            </div>`;
        getElems().messagesContainer.insertAdjacentHTML('beforeend', html);
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
    
    // Show dots locally immediately for the sender
    toggleGlobalLoading(true, activeRole);

    const formData = new FormData();
    if (isAudio) {
        formData.append('file', data, 'recording.wav');
    } else {
        formData.append('text', data);
    }
    
    formData.append('target_lang', targetLang);
    formData.append('sender', activeRole);

    try {
        const res = await fetch(`${API_BASE}/translate`, { method: 'POST', body: formData });
        const result = await res.json();
        
        if (result.error) {
            window.logToUI?.(result.error, 'ERROR');
            toggleGlobalLoading(false);
            return;
        }

        // The auto-play for the sender's own message is usually avoided, 
        // but it will trigger via syncHistory for the receiver.
        await syncHistory();
    } catch (err) {
        window.logToUI?.("Network error", "ERROR");
        toggleGlobalLoading(false);
    }
}

// --- 4. SYNC LOGIC ---
async function syncHistory() {
    const ui = getElems();
    try {
        const res = await fetch(`${API_BASE}/history`);
        const data = await res.json();
        const history = data.history || [];

        // Global Sync of loading dots
        toggleGlobalLoading(data.is_processing, data.active_sender);

        ui.statusDot.style.backgroundColor = "#10b981";
        ui.statusText.innerText = "Neural Sync Active";

        if (history.length > 0) document.getElementById('empty-state')?.remove();

        // Handle Reset
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

                // AUTO-PLAY: Only if this page is NOT the sender
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

    // Bubble Styles
    const bubbleClass = isCustomer 
        ? "bg-white text-slate-800 rounded-bl-none border-l-4 border-orange-500 shadow-md" 
        : "bg-slate-900 text-white rounded-br-none shadow-lg";

    // Play button BELOW the bubble
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
    setInterval(syncHistory, 1500);

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