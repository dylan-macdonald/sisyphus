// State management
let state = {
  cycle: 0,
  totalTokens: 0,
  streamingTime: 0,
  currentMessage: '',
  messageHistory: [],
  fullReceivedText: '',
  shouldReset: false,
  resetData: null
};

// DOM Elements
const outputContainer = document.querySelector('.output-container');
const output = document.getElementById('output');
const cycleEl = document.getElementById('cycle');
const tokensEl = document.getElementById('tokens');
const timeEl = document.getElementById('time');
const statusEl = document.getElementById('status');
const currentMessageEl = document.getElementById('currentMessage');
const messageHistoryEl = document.getElementById('messageHistory');
const infoToggle = document.getElementById('infoToggle');
const infoContent = document.getElementById('infoContent');

// Prevent scrolling on output container
if (outputContainer) {
  outputContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
  }, { passive: false });
  
  outputContainer.addEventListener('touchmove', (e) => {
    e.preventDefault();
  }, { passive: false });
}

// Info panel toggle
infoToggle.addEventListener('click', () => {
  infoContent.classList.toggle('visible');
});

// Close info panel when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.info-panel')) {
    infoContent.classList.remove('visible');
  }
});

// Initialize
console.log('🗿 Sisyphus client initialized');

// Update time display (server-managed)
function updateTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  timeEl.textContent = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Extract MESSAGE: from text
function extractMessage(text) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('MESSAGE:')) {
      return line.replace(/^MESSAGE:\s*/, '').trim();
    }
  }
  return null;
}

// Remove MESSAGE: lines from display text
function removeMessageLines(text) {
  return text.split('\n')
    .filter(line => !line.trim().startsWith('MESSAGE:'))
    .join('\n');
}

// Update current message display
function updateCurrentMessage(text) {
  const message = extractMessage(text);
  if (message) {
    state.currentMessage = message;
    currentMessageEl.textContent = message;
  }
}

// Add message to history
function addMessageToHistory(message, cycle) {
  if (!message) return;
  
  state.messageHistory.push({ message, cycle });
  
  // Clear empty state
  if (messageHistoryEl.querySelector('.message-history-empty')) {
    messageHistoryEl.innerHTML = '';
  }
  
  // Add new message item
  const item = document.createElement('div');
  item.className = 'message-history-item';
  item.innerHTML = `<span>CYCLE ${cycle}</span>${message}`;
  messageHistoryEl.appendChild(item);
}

// Track current paragraph for direct rendering
let currentParagraph = null;

// Limit DOM elements to prevent memory bloat
// Keep fewer elements since user can't scroll back anyway
function pruneOldContent() {
  const maxElements = 50; // Keep only last 50 elements - less memory, cleaner
  const children = Array.from(output.children);
  
  if (children.length > maxElements) {
    const toRemove = children.length - maxElements;
    for (let i = 0; i < toRemove; i++) {
      children[i].remove();
    }
  }
}

// Connect to server stream
function connectToServer() {
  statusEl.textContent = 'CONNECTING';
  statusEl.className = 'stat-value status-waiting';
  
  const eventSource = new EventSource('/stream');
  let currentCycle = state.cycle;
  
  eventSource.addEventListener('message', (e) => {
    try {
      const data = JSON.parse(e.data);
      
      switch (data.type) {
        case 'metadata':
          // New response starting - reset state for this response
          state.fullReceivedText = '';
          
          currentCycle = data.cycle;
          state.cycle = data.cycle;
          cycleEl.textContent = data.cycle;
          
          // Prune old content to prevent memory bloat
          pruneOldContent();
          
          // Add cycle marker or continuation marker
          if (data.isContinuation) {
            const continuation = document.createElement('div');
            continuation.className = 'continuation-footnote';
            continuation.textContent = '(CONTINUED)';
            output.appendChild(continuation);
          } else if (state.cycle > 1) {
            const marker = document.createElement('div');
            marker.className = 'cycle-marker';
            marker.textContent = `═══ CYCLE ${data.cycle} ═══`;
            output.appendChild(marker);
          }
          
          // Start new paragraph
          currentParagraph = document.createElement('div');
          currentParagraph.className = 'output-text';
          output.appendChild(currentParagraph);
          
          statusEl.textContent = 'STREAMING';
          statusEl.className = 'stat-value status-streaming';
          break;
          
        case 'content':
          // Add incoming text directly - server handles throttling
          state.fullReceivedText += data.text;
          
          // Update token count in real-time (server calculates progressively)
          if (data.currentTokens !== undefined) {
            state.totalTokens = data.currentTokens;
            tokensEl.textContent = data.currentTokens.toLocaleString();
          }
          
          // Update display (without MESSAGE: lines)
          if (currentParagraph) {
            currentParagraph.textContent = removeMessageLines(state.fullReceivedText);
            
            // Update current message display
            updateCurrentMessage(state.fullReceivedText);
          }
          break;
          
        case 'complete':
          // Final token count update from server
          state.totalTokens = data.totalTokens;
          tokensEl.textContent = data.totalTokens.toLocaleString();
          break;
          
        case 'done':
          if (data.shouldReset) {
            // Save current message to history
            if (state.currentMessage) {
              addMessageToHistory(state.currentMessage, currentCycle);
            }
            
            // Reset current message
            state.currentMessage = '';
            currentMessageEl.textContent = '—';
          }
          
          statusEl.textContent = 'WAITING';
          statusEl.className = 'stat-value status-waiting';
          break;
          
        case 'timer':
          // Update time from server
          updateTime(data.streamingTime);
          break;
          
        case 'error':
          statusEl.textContent = 'ERROR';
          statusEl.className = 'stat-value status-error';
          break;
      }
    } catch (error) {
      console.error('❌ Error parsing server data:', error);
    }
  });
  
  eventSource.addEventListener('error', (error) => {
    statusEl.textContent = 'DISCONNECTED';
    statusEl.className = 'stat-value status-error';
    eventSource.close();
    
    // Reconnect after 5 seconds
    setTimeout(() => {
      connectToServer();
    }, 5000);
  });
}

// Fetch initial stats and connect
async function initialize() {
  try {
    const response = await fetch('/stats');
    const stats = await response.json();
    
    state.cycle = stats.cycle;
    state.totalTokens = stats.totalTokens;
    state.streamingTime = stats.streamingTime;
    
    cycleEl.textContent = stats.cycle;
    tokensEl.textContent = stats.totalTokens.toLocaleString();
    updateTime(stats.streamingTime);
    
    // Connect to server stream
    connectToServer();
  } catch (error) {
    statusEl.textContent = 'ERROR';
    statusEl.className = 'stat-value status-error';
    
    // Retry after 3 seconds
    setTimeout(initialize, 3000);
  }
}

// Start the app
initialize();
