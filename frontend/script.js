let mediaRecorder;
let audioChunks = [];

// DOM Elements
const recordBtn = document.getElementById('recordBtn');
const textInput = document.getElementById('textInput');
const messagesContainer = document.getElementById('messages-container');
const userRole = document.getElementById('userRole');
const resetBtn = document.getElementById('resetBtn');

// --- 1. Audio Recording Logic ---

recordBtn.onclick = async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        recordBtn.classList.remove('rec-pulse', 'bg-red-600');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            processInput(audioBlob, true);
        };

        mediaRecorder.start();
        recordBtn.classList.add('rec-pulse', 'bg-red-600');
    } catch (err) {
        alert("Please allow microphone access to use speech-to-speech.");
    }
};

// --- 2. Text Input Logic ---

textInput.onkeypress = (e) => {
    if (e.key === 'Enter' && textInput.value.trim() !== "") {
        processInput(textInput.value, false);
        textInput.value = "";
    }
};

// --- 3. UI Message Handling ---

function createMessageBubble(role) {
    const isCustomer = role === 'customer';
    const bubbleId = 'msg-' + Date.now();
    
    const html = `
        <div class="flex ${isCustomer ? 'justify-start' : 'justify-end'} animate-fade-in mb-4">
            <div class="flex ${isCustomer ? 'flex-row' : 'flex-row-reverse'} max-w-[80%] items-end space-x-2">
                <div class="w-8 h-8 rounded-full ${isCustomer ? 'bg-gray-400' : 'bg-orange-600'} flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                    ${isCustomer ? 'C' : 'A'}
                </div>
                
                <div class="space-y-1">
                    <div id="${bubbleId}-box" class="p-4 shadow-sm ${isCustomer ? 'bg-white text-gray-800' : 'bg-orange-500 text-white'} rounded-2xl relative">
                        <div id="${bubbleId}-loader" class="flex space-x-1 items-center py-1">
                            <div class="typing-dot bg-current opacity-60"></div>
                            <div class="typing-dot bg-current opacity-60"></div>
                            <div class="typing-dot bg-current opacity-60"></div>
                        </div>
                        
                        <p id="${bubbleId}-transcription" class="text-xs opacity-70 italic hidden border-b border-white/20 pb-1 mb-1"></p>
                        
                        <p id="${bubbleId}-translation" class="text-md font-medium hidden"></p>
                    </div>
                    
                    <button id="${bubbleId}-play" class="hidden text-[10px] flex items-center space-x-1 uppercase font-bold text-orange-600 hover:opacity-70 transition-opacity">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
                        </svg>
                        <span>Listen</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    messagesContainer.insertAdjacentHTML('beforeend', html);
    const chatWindow = document.getElementById('chat-window') || messagesContainer.parentElement;
    chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
    
    return bubbleId;
}

// --- 4. Main Processing (Streaming Consumer) ---

async function processInput(data, isAudio) {
    const role = userRole.value;
    const targetLang = role === 'customer' ? 'fr' : 'en'; 
    const bubbleId = createMessageBubble(role);

    const formData = new FormData();
    if (isAudio) {
        formData.append('file', data, 'input.wav');
    } else {
        formData.append('text', data); 
    }
    formData.append('target_lang', targetLang);

    try {
        const response = await fetch('http://localhost:8000/translate', {
            method: 'POST',
            body: formData
        });

        if (!response.body) throw new Error("ReadableStream not supported.");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // Process the stream line by line
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            
            // The backend sends NDJSON (line-separated JSON)
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (!line.trim()) continue;
                
                const result = JSON.parse(line);

                if (result.type === 'transcription') {
                    // Update Transcription UI (The "Pop")
                    const transNode = document.getElementById(`${bubbleId}-transcription`);
                    transNode.innerText = result.text;
                    transNode.classList.remove('hidden');
                    // Loader remains visible!
                } 
                
                if (result.type === 'translation') {
                    // Final step: Hide loader and show translation
                    document.getElementById(`${bubbleId}-loader`).classList.add('hidden');
                    
                    const translNode = document.getElementById(`${bubbleId}-translation`);
                    translNode.innerText = result.text;
                    translNode.classList.remove('hidden');

                    // Audio Playback
                    const playBtn = document.getElementById(`${bubbleId}-play`);
                    playBtn.classList.remove('hidden');
                    playBtn.onclick = () => speakText(result.text, targetLang);
                    
                    speakText(result.text, targetLang);
                }

                if (result.type === 'error') {
                   throw new Error(result.text);
                }
            }
        }

    } catch (error) {
        console.error(error);
        const loader = document.getElementById(`${bubbleId}-loader`);
        if (loader) loader.innerHTML = `<span class="text-red-500 text-xs">Error: ${error.message}</span>`;
    }
}

// --- 5. Text-to-Speech (TTS) ---

function speakText(text, langCode) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const langMap = { 'fr': 'fr-FR', 'en': 'en-US' };
    utterance.lang = langMap[langCode] || 'en-US';
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
}

// --- 6. Reset UI ---

resetBtn.onclick = () => {
    if (confirm("Reset conversation?")) {
        messagesContainer.innerHTML = '';
    }
};