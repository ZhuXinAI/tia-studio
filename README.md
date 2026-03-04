# TIA Studio

<p align="center">
  <img src="tia-studio.png" alt="TIA Studio Interface" width="800">
</p>

A modern, desktop-native AI assistant workspace built with simplicity in mind. TIA Studio provides a clean interface for managing multiple AI agents and conversations, all running locally on your machine.

## What is TIA Studio?

TIA Studio is an Electron-based desktop application that brings AI assistants to your workflow. It features a conversation-based interface where you can interact with different AI agents, manage multiple threads, and keep your work organized in one place.

The application emphasizes simplicity and ease of use - no complex configurations, just straightforward AI assistance when you need it.

## Architecture

TIA Studio is built on a carefully selected stack that prioritizes developer experience and maintainability:

- **[Mastra](https://mastra.ai)** - Powers the agent framework and workspace management, providing a clean abstraction for connecting AI models and managing agent lifecycles
- **[Assistant UI](https://www.assistant-ui.com/)** - Delivers the chat interface components, handling message rendering, streaming responses, and conversation state
- **Electron + React** - Provides the desktop application shell with a modern React-based UI
- **TypeScript** - Ensures type safety across the entire codebase

### Design Philosophy

We intentionally kept the architecture simple:

1. **Agents as first-class citizens** - Each assistant (like TIA or Default Agent) is a Mastra agent with its own configuration and capabilities
2. **Workspace-centric** - Conversations are organized into threads, making it easy to context-switch between different tasks
3. **Minimal abstractions** - We use Mastra's agent primitives directly rather than building custom layers, and Assistant UI handles the chat UX without custom message components
4. **Local-first** - Everything runs on your machine, with no required cloud dependencies

## Features

- 🤖 Multiple AI assistants with different capabilities
- 💬 Thread-based conversation management
- 🎨 Clean, dark-themed interface
- 🔒 Local-first architecture
- ⚡ Fast, native desktop performance

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Building

```bash
# For macOS
npm run build:mac

# For Windows
npm run build:win

# For Linux
npm run build:linux
```

## Project Structure

```
tia-studio/
├── src/
│   ├── main/          # Electron main process
│   ├── renderer/      # React UI components
│   └── preload/       # Electron preload scripts
├── build/             # Build resources (icons, etc.)
└── resources/         # Application resources
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Desktop**: Electron 39
- **AI Framework**: Mastra, AI SDK
- **UI Components**: Assistant UI, Radix UI
- **Build**: Vite, electron-builder

## Development

### Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

### Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm test` - Run tests

## License

MIT
