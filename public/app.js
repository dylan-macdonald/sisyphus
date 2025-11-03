// State management
const state = {
    isStreaming: false,
    currentCycle: 0,
    isContinuation: false,
    totalTokens: 0,
    conversationTokens: 0,
    startTime: null,
    charQueue: [], // Queue for character-by-character display
    isDisplaying: false,
    waitingForDisplay: false, // Flag to prevent requesting next exchange too soon
};

// DOM elements
const elements = {
    output: document.getElementById('output'),
    cycle: document.getElementById('cycle'),
    tokens: document.getElementById('tokens'),
    time: document.getElementById('time'),
    status: document.getElementById('status'),
    infoToggle: document.getElementById('infoToggle'),
    infoContent: document.getElementById('infoContent'),
};

// Constants for human-like typing
const BASE_CHAR_DELAY = 40; // Base ms per character (slow typist ~25 wpm)
const PUNCTUATION_PAUSE = 150; // Extra pause after punctuation
const SPACE_DELAY = 20; // Slight pause on spaces
const NEWLINE_PAUSE = 300; // Pause on newlines
const VARIATION = 30; // Random variation in typing speed
const CYCLE_PAUSE = 3000; // ms pause between cycles

// Initialize
init();

function init() {
    updateTimerDisplay();
    setInterval(updateTimerDisplay, 1000);

    // Info panel toggle
    elements.infoToggle.addEventListener('click', () => {
        elements.infoContent.classList.toggle('visible');
    });

    // Close info panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!elements.infoToggle.contains(e.target) && !elements.infoContent.contains(e.target)) {
            elements.infoContent.classList.remove('visible');
        }
    });

    // Auto-start after short delay
    setTimeout(() => {
        startStream();
    }, 1000);
}

// Calculate delay for character (human-like typing)
function getCharDelay(char, prevChar) {
    let delay = BASE_CHAR_DELAY + (Math.random() * VARIATION - VARIATION / 2);

    // Punctuation gets a longer pause
    if ('.!?'.includes(char)) {
        delay += PUNCTUATION_PAUSE;
    }
    // Commas, colons, semicolons get medium pause
    else if (',:;'.includes(char)) {
        delay += PUNCTUATION_PAUSE * 0.5;
    }
    // Spaces get tiny pause
    else if (char === ' ') {
        delay += SPACE_DELAY;
    }
    // Newlines get longer pause
    else if (char === '\n') {
        delay += NEWLINE_PAUSE;
    }

    return Math.max(10, delay); // Minimum 10ms
}

// Start streaming
async function startStream() {
    if (state.isStreaming) return;

    state.isStreaming = true;

    if (!state.startTime) {
        state.startTime = Date.now();
    }

    updateUI();

    try {
        const eventSource = new EventSource('/stream');

        eventSource.addEventListener('message', (event) => {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'metadata':
                    handleMetadata(data);
                    break;
                case 'content':
                    handleContent(data);
                    break;
                case 'complete':
                    handleComplete(data);
                    break;
                case 'error':
                    handleError(data);
                    eventSource.close();
                    break;
                case 'done':
                    eventSource.close();
                    state.isStreaming = false;
                    state.waitingForDisplay = true;
                    updateUI();

                    // If this was a reset, show cycle marker
                    if (data.shouldReset) {
                        // Wait for character display to finish
                        const checkDisplayComplete = setInterval(() => {
                            if (state.charQueue.length === 0 && !state.isDisplaying) {
                                clearInterval(checkDisplayComplete);

                                // Add cycle marker
                                currentParagraph = null;
                                const marker = document.createElement('div');
                                marker.className = 'cycle-marker';
                                marker.textContent = `— CYCLE ${state.currentCycle} COMPLETE —`;
                                elements.output.appendChild(marker);

                                // Wait then start new cycle
                                setTimeout(() => {
                                    state.waitingForDisplay = false;
                                    startStream();
                                }, CYCLE_PAUSE);
                            }
                        }, 100);
                    } else {
                        // Wait for most of character queue to drain before next exchange
                        const checkQueueDrained = setInterval(() => {
                            // Continue when queue is nearly empty (< 50 chars left)
                            if (state.charQueue.length < 50) {
                                clearInterval(checkQueueDrained);
                                state.waitingForDisplay = false;

                                // Short pause between exchanges (not full cycle pause)
                                setTimeout(() => {
                                    startStream();
                                }, 1000);
                            }
                        }, 100);
                    }
                    break;
            }
        });

        eventSource.onerror = (error) => {
            console.error('EventSource error:', error);
            eventSource.close();
            state.isStreaming = false;
            setStatus('ERROR', 'error');
            updateUI();

            // Retry after delay
            setTimeout(() => {
                startStream();
            }, 5000);
        };

    } catch (error) {
        console.error('Stream error:', error);
        state.isStreaming = false;
        setStatus('ERROR', 'error');
        updateUI();

        // Retry after delay
        setTimeout(() => {
            startStream();
        }, 5000);
    }
}

// Handle metadata
function handleMetadata(data) {
    state.currentCycle = data.cycle;
    state.isContinuation = data.isContinuation;

    // Add (Continued) footnote if this is a continuation
    if (data.isContinuation) {
        const footnote = document.createElement('div');
        footnote.className = 'continuation-footnote';
        footnote.textContent = '(Continued)';
        footnote.title = 'Claude was prompted to continue the conversation';
        elements.output.appendChild(footnote);
    }

    updateUI();
}

// Handle content streaming - add characters to queue
let currentParagraph = null;

function handleContent(data) {
    state.totalTokens++;

    // Add each character of the token to the queue
    for (let i = 0; i < data.text.length; i++) {
        state.charQueue.push(data.text[i]);
    }

    // Start displaying if not already
    if (!state.isDisplaying) {
        displayNextChar();
    }

    updateUI();
}

// Display characters one by one from queue (human typing)
function displayNextChar() {
    if (state.charQueue.length === 0) {
        state.isDisplaying = false;
        return;
    }

    state.isDisplaying = true;

    const char = state.charQueue.shift();
    const prevChar = currentParagraph ? currentParagraph.textContent.slice(-1) : '';

    // Create or update paragraph
    if (!currentParagraph) {
        currentParagraph = document.createElement('div');
        currentParagraph.className = 'output-text';
        elements.output.appendChild(currentParagraph);
    }

    currentParagraph.textContent += char;

    // Create new paragraph on double newline
    if (currentParagraph.textContent.endsWith('\n\n')) {
        currentParagraph = null;
    }

    // Auto scroll
    window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
    });

    // Schedule next character with human-like delay
    const delay = getCharDelay(char, prevChar);
    setTimeout(displayNextChar, delay);
}

// Handle completion
function handleComplete(data) {
    state.conversationTokens = data.conversationTokens || 0;
    updateUI();
}

// Handle errors
function handleError(data) {
    console.error('API Error:', data.message);

    const error = document.createElement('div');
    error.className = 'output-text';
    error.style.color = 'var(--text-bright)';
    error.textContent = `[ERROR: ${data.message}]`;
    elements.output.appendChild(error);

    setStatus('ERROR', 'error');
}

// Update UI
function updateUI() {
    elements.cycle.textContent = state.currentCycle;
    elements.tokens.textContent = state.totalTokens.toLocaleString();

    // Update status
    if (state.isStreaming) {
        setStatus('STREAMING', 'streaming');
    } else if (state.waitingForDisplay) {
        setStatus('DISPLAYING', 'streaming');
    } else if (state.currentCycle > 0) {
        setStatus('PAUSED', 'waiting');
    } else {
        setStatus('READY', 'waiting');
    }
}

// Set status
function setStatus(text, type) {
    elements.status.textContent = text;
    elements.status.className = `stat-value status-${type}`;
}

// Update timer display
function updateTimerDisplay() {
    if (!state.startTime) {
        elements.time.textContent = '00:00';
        return;
    }

    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;

    if (hours > 0) {
        elements.time.textContent =
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else {
        elements.time.textContent =
            `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

// Update messages display
function updateMessages(messages) {
    elements.messages.innerHTML = '';

    if (!messages || messages.length === 0) {
        elements.messages.innerHTML = '<div style="color: var(--text-dim); font-size: 0.7rem;">No messages yet...</div>';
        return;
    }

    // Display last 5 messages
    messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message-item';

        const cycleLabel = document.createElement('div');
        cycleLabel.className = 'message-cycle';
        cycleLabel.textContent = `CYCLE ${msg.cycle}`;

        const messageText = document.createElement('div');
        messageText.textContent = msg.text;

        messageDiv.appendChild(cycleLabel);
        messageDiv.appendChild(messageText);
        elements.messages.appendChild(messageDiv);
    });

    // Auto-scroll to bottom
    elements.messages.scrollTop = elements.messages.scrollHeight;
}
