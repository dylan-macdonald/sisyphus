// State management
const state = {
    isStreaming: false,
    autoScroll: true,
    currentAttempt: 0,
    totalTokens: 0,
    startTime: null,
    currentTokens: 0,
    maxTokens: 4096,
};

// DOM elements
const elements = {
    output: document.getElementById('output'),
    startBtn: document.getElementById('startBtn'),
    continueBtn: document.getElementById('continueBtn'),
    resetBtn: document.getElementById('resetBtn'),
    scrollToggle: document.getElementById('scrollToggle'),
    attempt: document.getElementById('attempt'),
    tokens: document.getElementById('tokens'),
    time: document.getElementById('time'),
    status: document.getElementById('status'),
    contextFill: document.getElementById('contextFill'),
    contextPercent: document.getElementById('context-percent'),
    boulder: document.getElementById('boulder'),
    canvas: document.getElementById('bgCanvas'),
};

// Event listeners
elements.startBtn.addEventListener('click', startTask);
elements.continueBtn.addEventListener('click', continueTask);
elements.resetBtn.addEventListener('click', resetTask);
elements.scrollToggle.addEventListener('click', toggleAutoScroll);

// Initialize
init();

function init() {
    setupCanvas();
    animateBackground();
    updateTimerDisplay();
    setInterval(updateTimerDisplay, 1000);
}

// Start the task
async function startTask() {
    if (state.isStreaming) return;

    // Clear output on first start
    if (state.currentAttempt === 0) {
        elements.output.innerHTML = '';
    }

    await streamFromAPI();
}

// Continue the task (next attempt)
async function continueTask() {
    if (state.isStreaming) return;
    await streamFromAPI();
}

// Reset everything
async function resetTask() {
    if (state.isStreaming) {
        if (!confirm('A stream is in progress. Are you sure you want to reset?')) {
            return;
        }
    }

    try {
        await fetch('/reset', { method: 'POST' });

        state.currentAttempt = 0;
        state.totalTokens = 0;
        state.currentTokens = 0;
        state.startTime = null;
        state.isStreaming = false;

        elements.output.innerHTML = `
            <div class="output-placeholder">
                <p>The task awaits...</p>
                <p class="output-hint">Click "Begin the Task" to start the eternal cycle</p>
            </div>
        `;

        updateUI();
        updateContextWindow(0);
    } catch (error) {
        console.error('Reset error:', error);
    }
}

// Toggle auto-scroll
function toggleAutoScroll() {
    state.autoScroll = !state.autoScroll;
    elements.scrollToggle.textContent = `Auto-scroll: ${state.autoScroll ? 'ON' : 'OFF'}`;
}

// Stream from API
async function streamFromAPI() {
    state.isStreaming = true;
    state.currentTokens = 0;

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
                    break;
            }
        });

        eventSource.onerror = (error) => {
            console.error('EventSource error:', error);
            eventSource.close();
            state.isStreaming = false;
            setStatus('Error', 'error');
            updateUI();
        };

    } catch (error) {
        console.error('Stream error:', error);
        state.isStreaming = false;
        setStatus('Error', 'error');
        updateUI();
    }
}

// Handle metadata
function handleMetadata(data) {
    state.currentAttempt = data.attempt;

    // Add attempt marker
    const marker = document.createElement('div');
    marker.className = 'attempt-marker';
    marker.textContent = `ATTEMPT #${data.attempt}`;
    elements.output.appendChild(marker);

    if (state.autoScroll) {
        elements.output.scrollTop = elements.output.scrollHeight;
    }

    updateUI();
}

// Handle content streaming
let currentParagraph = null;

function handleContent(data) {
    state.currentTokens = data.tokens;
    state.totalTokens++;

    // Create or update paragraph
    if (!currentParagraph) {
        currentParagraph = document.createElement('p');
        currentParagraph.className = 'output-text';
        elements.output.appendChild(currentParagraph);
    }

    currentParagraph.textContent += data.text;

    // Create new paragraph on double newline
    if (data.text.includes('\n\n')) {
        currentParagraph = null;
    }

    // Update context window
    const percentage = (state.currentTokens / state.maxTokens) * 100;
    updateContextWindow(percentage);

    // Auto scroll
    if (state.autoScroll) {
        elements.output.scrollTop = elements.output.scrollHeight;
    }

    updateUI();
}

// Handle completion
function handleComplete(data) {
    currentParagraph = null;
    state.totalTokens = data.totalTokens;

    // Add completion message
    const completion = document.createElement('p');
    completion.className = 'output-text';
    completion.style.color = 'var(--text-secondary)';
    completion.style.fontStyle = 'italic';
    completion.style.marginTop = '2rem';
    completion.textContent = `[Context limit reached. The boulder rolls down. Attempt #${state.currentAttempt} complete.]`;
    elements.output.appendChild(completion);

    if (state.autoScroll) {
        elements.output.scrollTop = elements.output.scrollHeight;
    }

    // Reset context window with animation
    setTimeout(() => {
        updateContextWindow(0);
    }, 1000);
}

// Handle errors
function handleError(data) {
    console.error('API Error:', data.message);

    const error = document.createElement('p');
    error.className = 'output-text';
    error.style.color = 'var(--danger)';
    error.textContent = `[Error: ${data.message}]`;
    elements.output.appendChild(error);

    setStatus('Error', 'error');
}

// Update context window visualization
function updateContextWindow(percentage) {
    const clampedPercentage = Math.min(100, Math.max(0, percentage));
    elements.contextFill.style.width = `${clampedPercentage}%`;
    elements.contextPercent.textContent = `${Math.round(clampedPercentage)}%`;
    elements.boulder.style.left = `${clampedPercentage}%`;

    // Change color as it fills
    if (clampedPercentage > 80) {
        elements.contextFill.style.background = 'linear-gradient(90deg, var(--warning), var(--danger))';
    } else {
        elements.contextFill.style.background = 'linear-gradient(90deg, var(--accent), #a78bfa)';
    }
}

// Update UI
function updateUI() {
    elements.attempt.textContent = state.currentAttempt;
    elements.tokens.textContent = state.totalTokens.toLocaleString();

    // Update buttons
    elements.startBtn.disabled = state.isStreaming || state.currentAttempt > 0;
    elements.continueBtn.disabled = state.isStreaming || state.currentAttempt === 0;
    elements.resetBtn.disabled = state.isStreaming;

    // Update status
    if (state.isStreaming) {
        setStatus('Streaming', 'streaming');
    } else if (state.currentAttempt > 0) {
        setStatus('Waiting', 'waiting');
    } else {
        setStatus('Ready', 'waiting');
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
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    elements.time.textContent =
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Canvas background animation
function setupCanvas() {
    const canvas = elements.canvas;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

function animateBackground() {
    const canvas = elements.canvas;
    const ctx = canvas.getContext('2d');

    const particles = [];
    const particleCount = 50;

    // Create particles
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            radius: Math.random() * 2 + 1,
        });
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Update and draw particles
        particles.forEach((p, i) => {
            // Update position
            p.x += p.vx;
            p.y += p.vy;

            // Wrap around edges
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height;
            if (p.y > canvas.height) p.y = 0;

            // Draw particle
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(74, 158, 255, 0.5)';
            ctx.fill();

            // Draw connections
            particles.slice(i + 1).forEach((p2) => {
                const dx = p.x - p2.x;
                const dy = p.y - p2.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 150) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.strokeStyle = `rgba(74, 158, 255, ${0.2 * (1 - distance / 150)})`;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            });
        });

        requestAnimationFrame(draw);
    }

    draw();
}
