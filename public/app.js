// State management
const state = {
    isStreaming: false,
    currentAttempt: 0,
    totalTokens: 0,
    startTime: null,
    tokenQueue: [], // Queue for token-by-token display
    isDisplaying: false,
};

// DOM elements
const elements = {
    output: document.getElementById('output'),
    attempt: document.getElementById('attempt'),
    tokens: document.getElementById('tokens'),
    time: document.getElementById('time'),
    status: document.getElementById('status'),
};

// Constants
const TOKEN_DISPLAY_DELAY = 120; // ms between tokens (human readable speed)
const CYCLE_PAUSE = 2000; // ms pause between cycles

// Initialize
init();

function init() {
    updateTimerDisplay();
    setInterval(updateTimerDisplay, 1000);

    // Auto-start after short delay
    setTimeout(() => {
        startStream();
    }, 1000);
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
                    updateUI();

                    // Auto-continue after pause
                    setTimeout(() => {
                        startStream();
                    }, CYCLE_PAUSE);
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
    state.currentAttempt = data.attempt;

    // Add cycle marker
    const marker = document.createElement('div');
    marker.className = 'cycle-marker';
    marker.textContent = `— CYCLE ${data.attempt} —`;
    elements.output.appendChild(marker);

    updateUI();
}

// Handle content streaming - add to queue
let currentParagraph = null;

function handleContent(data) {
    state.totalTokens++;

    // Add token to queue
    state.tokenQueue.push(data.text);

    // Start displaying if not already
    if (!state.isDisplaying) {
        displayNextToken();
    }

    updateUI();
}

// Display tokens one by one from queue
function displayNextToken() {
    if (state.tokenQueue.length === 0) {
        state.isDisplaying = false;
        return;
    }

    state.isDisplaying = true;

    const token = state.tokenQueue.shift();

    // Create or update paragraph
    if (!currentParagraph) {
        currentParagraph = document.createElement('div');
        currentParagraph.className = 'output-text';
        elements.output.appendChild(currentParagraph);
    }

    currentParagraph.textContent += token;

    // Create new paragraph on double newline
    if (token.includes('\n\n')) {
        currentParagraph = null;
    }

    // Auto scroll
    window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
    });

    // Schedule next token
    setTimeout(displayNextToken, TOKEN_DISPLAY_DELAY);
}

// Handle completion
function handleComplete(data) {
    currentParagraph = null;
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
    elements.attempt.textContent = state.currentAttempt;
    elements.tokens.textContent = state.totalTokens.toLocaleString();

    // Update status
    if (state.isStreaming) {
        setStatus('STREAMING', 'streaming');
    } else if (state.currentAttempt > 0) {
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
