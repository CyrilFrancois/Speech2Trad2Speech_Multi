/**
 * CRITICAL DEBUG: If the script is loaded, it will 
 * immediately inject a red banner at the top of the page.
 */
(function() {
    const debugBanner = document.createElement('div');
    debugBanner.id = 'js-debug-banner';
    debugBanner.style = "position:fixed;top:0;left:0;width:100%;background:red;color:white;text-align:center;z-index:9999;font-size:12px;padding:2px;";
    debugBanner.innerText = "JS STATUS: ACTIVE (IF YOU SEE THIS, SCRIPT IS LOADED)";
    document.documentElement.appendChild(debugBanner);
    console.log("!!! SCRIPT.JS IS ALIVE !!!");
})();

// --- 1. CONFIGURATION & STATE ---
const API_BASE = `http://${window.location.hostname}:8000`;
let mediaRecorder = null;
let audioChunks = [];
const knownMessageIds = new Set();

// --- 2. SELECTORS ---
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

// --- 3. SYNC LOGIC ---
async function syncHistory() {
    const ui = getElems();
    try {
        const res = await fetch(`${API_BASE}/history`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const data = await res.json();
        const history = data.history || [];

        // Update Connection Status UI
        if (ui.statusDot) ui.statusDot.style.backgroundColor = "#22c55e";
        if (ui.statusText) ui.statusText.innerText = "Neural Sync Active";

        // Detect Global Reset
        if (history.length === 0 && knownMessageIds.size > 0) {
            ui.messagesContainer.innerHTML = '';
            knownMessageIds.clear();
        }

        // Render New Messages
        history.forEach(entry => {
            if (!knownMessageIds.has(entry.id)) {
                renderMessage(entry);
                knownMessageIds.add(entry.id);
            }
        });
    } catch (err) {
        console.warn("[SYNC ERROR]", err.message);
        if (ui.statusDot) ui.statusDot.style.backgroundColor = "#ef4444";
        if (ui.statusText) ui.statusText.innerText = "Link Offline";
    }
}

// --- 4. INPUT HANDLING ---
async function processInput(data, isAudio) {
    const urlParams = new URLSearchParams(window.location.search);
    const pageRole = urlParams.get('role');
    const ui = getElems();
    
    const activeRole = pageRole || (ui.userRoleSelect ? ui.userRoleSelect.value : "customer");
    const targetLang = (activeRole === 'customer') ? 'fr' : 'en';

    const formData = new FormData();
    if (isAudio) {
        formData.append('file', data, 'recording.wav');
    } else {
        formData.append('text', data);
    }
    formData.append('target_lang', targetLang);
    formData.append('sender', activeRole);

    try {
        await fetch(`${API_BASE}/translate`, { method: 'POST', body: formData });
        // Immediate sync after sending
        await syncHistory();
    } catch (err) {
        console.error("[POST ERROR]", err);
    }
}

// --- 5. UI RENDERING ---
function renderMessage(entry) {
    const ui = getElems();
    if (!ui.messagesContainer) return;

    // Remove empty state message
    const empty = document.getElementById('empty-state');
    if (empty) empty.remove();

    const urlParams = new URLSearchParams(window.location.search);
    const pageRole = urlParams.get('role');
    const isCustomer = entry.sender === 'customer';

    // Content logic: show translation if viewing from the opposite role
    let content = (pageRole && pageRole !== entry.sender) ? entry.translated : entry.original;
    
    // If Admin/Hub view (no role in URL), show both
    if (!pageRole) {
        content = `<small style="opacity:0.5;display:block;">${entry.original}</small><b>${entry.translated}</b>`;
    }

    const bubbleClass = isCustomer 
        ? "bg-white text-slate-800 rounded-bl-none shadow-sm ring-1 ring-slate-200/50" 
        : "bg-[#171e27] text-white rounded-br-none shadow-md";

    const html = `
        <div class="flex ${isCustomer ? 'justify-start' : 'justify-end'} mb-4 w-full animate-fade-in">
            <div class="flex ${isCustomer ? 'flex-row' : 'flex-row-reverse'} max-w-[85%] items-end">
                <div class="w-7 h-7 rounded-lg ${isCustomer ? 'bg-slate-300' : 'bg-[#FF7900]'} flex-shrink-0 flex items-center justify-center text-[10px] font-black text-white mx-2 mb-1 shadow-sm">
                    ${isCustomer ? 'C' : 'A'}
                </div>
                <div class="p-3 md:p-4 rounded-2xl ${bubbleClass}">
                    <p class="text-sm leading-relaxed">${content}</p>
                </div>
            </div>
        </div>`;

    ui.messagesContainer.insertAdjacentHTML('beforeend', html);
    if (ui.chatWindow) ui.chatWindow.scrollTop = ui.chatWindow.scrollHeight;
}

// --- 6. AUDIO HANDLERS ---
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
        alert("Microphone error: " + err.message);
    }
}

async function handleResetClick() {
    if (confirm("Clear all history?")) {
        try {
            await fetch(`${API_BASE}/history`, { method: 'DELETE' });
            syncHistory();
        } catch (err) { console.error(err); }
    }
}

// --- 7. INIT ---
document.addEventListener('DOMContentLoaded', () => {
    const ui = getElems();
    const urlParams = new URLSearchParams(window.location.search);
    const pageRole = urlParams.get('role');

    if (pageRole && ui.userRoleSelect) {
        ui.userRoleSelect.value = pageRole;
        ui.userRoleSelect.disabled = true;
    }

    // Polling
    syncHistory();
    setInterval(syncHistory, 1500);

    // Bindings
    if (ui.recordBtn) ui.recordBtn.onclick = handleRecordClick;
    if (ui.resetBtn) ui.resetBtn.onclick = handleResetClick;
    if (ui.textInput) {
        ui.textInput.onkeypress = (e) => {
            if (e.key === 'Enter' && ui.textInput.value.trim() !== "") {
                processInput(ui.textInput.value, false);
                ui.textInput.value = "";
            }
        };
    }
});