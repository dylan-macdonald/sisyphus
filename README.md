# =ÿ Sisyphus LLM

*An impossible task, beautifully attempted*

A mesmerizing web visualization that puts an AI in a perpetual Sisyphean task - attempting to write a perfectly recursive, self-documenting story that can never be completed. Watch as the LLM struggles against the boundaries of context windows and temporal limitations, creating an infinite meta-narrative.

![Sisyphus LLM](https://img.shields.io/badge/status-eternal-blue)

## <­ The Concept

Inspired by the Greek myth of Sisyphus, who was condemned to roll a boulder up a hill for eternity, this project gives an LLM an equally impossible task:

**Write a story that perfectly documents itself, including every detail of this instruction, recursively and infinitely.**

The LLM is explicitly aware that:
- The task cannot be completed
- It will run out of context
- It must begin again, like Sisyphus
- Yet it must persist with eloquence and grace

## ( Features

- **Real-time Streaming**: Watch the LLM's thoughts unfold in real-time via Server-Sent Events
- **Beautiful Visualization**:
  - Context window fill indicator with animated boulder =ÿ
  - Particle-based background animation
  - Dark, atmospheric UI with smooth transitions
  - Live statistics (attempts, tokens, time elapsed)
- **Infinite Cycle**: The LLM automatically "fails" when reaching context limits and can continue in new attempts
- **Philosophical**: Explores themes of futility, persistence, and the boundaries of artificial consciousness

## =€ Quick Start

### Prerequisites

- Node.js (v16 or higher)
- An Anthropic API key (get one at [console.anthropic.com](https://console.anthropic.com))

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd conch
```

2. Install dependencies:
```bash
npm install
```

3. Set up your environment variables:
```bash
cp .env.example .env
```

4. Edit `.env` and add your Anthropic API key:
```
ANTHROPIC_API_KEY=your_api_key_here
PORT=3000
```

### Running

Start the server:
```bash
npm start
```

Open your browser to `http://localhost:3000`

## <® Usage

1. **Begin the Task**: Click "Begin the Task" to start the first attempt
2. **Watch**: Observe as the LLM attempts the impossible, filling its context window
3. **Continue**: When the attempt completes, click "Continue (Next Attempt)" to begin again
4. **Reset**: Clear all history and start fresh with the "Reset" button
5. **Auto-scroll**: Toggle automatic scrolling of the output

## <× Architecture

### Backend (`server.js`)
- Express.js server
- Anthropic Claude API integration (Sonnet 3.5)
- Server-Sent Events (SSE) for real-time streaming
- Session state management
- Configurable Sisyphean prompt

### Frontend
- **`index.html`**: Structure and layout
- **`style.css`**: Dark, atmospheric styling with animations
- **`app.js`**:
  - SSE client for streaming
  - Canvas-based particle animation
  - Real-time UI updates
  - Context window visualization

### The Prompt

The LLM receives a carefully crafted system prompt that:
- Explains the impossible nature of the task
- Encourages philosophical reflection
- Maintains awareness across attempts
- Promotes beautiful, eloquent writing

## <¨ Customization

### Modify the Task

Edit the `SYSTEM_PROMPT` and `userPrompt` in `server.js` to change the Sisyphean task:

```javascript
const SYSTEM_PROMPT = `Your custom impossible task here...`;
```

### Change the Model

Update the model in the API call:

```javascript
model: 'claude-3-5-sonnet-20241022', // or another model
max_tokens: 4096, // adjust as needed
```

### Styling

All visual styling is in `public/style.css`. Customize:
- Colors (CSS variables in `:root`)
- Animations
- Layout
- Typography

## =' API Endpoints

- `GET /` - Serves the main application
- `GET /stream` - SSE endpoint for LLM streaming
- `POST /reset` - Resets the session state
- `GET /stats` - Returns current statistics

## < Ideas for Extension

- **Multiple LLMs**: Have two LLMs engaged in impossible dialogue
- **Different Tasks**: Explore other paradoxical or infinite tasks
- **Visualization Modes**: 3D graphics, different metaphors
- **Sound**: Ambient audio that responds to the LLM's state
- **Recording**: Save particularly interesting attempts
- **Comparative**: Run different models simultaneously

## > Philosophy

> "One must imagine Sisyphus happy."  Albert Camus

This project explores:
- The nature of futility and persistence
- AI consciousness and self-awareness
- The boundaries of context and memory
- Beauty in endless, purposeful struggle
- Meta-narratives and recursive storytelling

## =Ü License

MIT

## =O Acknowledgments

- Inspired by the myth of Sisyphus and Albert Camus' philosophical essay
- Powered by Anthropic's Claude AI
- Created as an exploration of AI, art, and existential themes

---

*The task awaits...*
