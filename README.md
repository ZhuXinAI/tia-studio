# TIA Studio

<p align="center">
  <img src="tia-studio.png" alt="TIA Studio Interface" width="800">
</p>

A modern, desktop-native workspace for AI assistants, Teams, and Channels. TIA Studio gives you a clean interface for running local assistants, organizing them into teams, and connecting them to real-world channels from your own machine.

## What is TIA Studio?

TIA Studio is an Electron-based desktop application for building and operating AI assistants on your desktop. You can chat with a single assistant, coordinate a Team of assistants, or connect an assistant to a Channel so it can participate in conversations beyond the app itself.

An assistant connected to a channel effectively becomes an OpenClaw-inspired local operator running on your computer: always close to your tools, your files, and your workflow.

Today, TIA Studio supports Lark channels. Telegram and WhatsApp support are coming very soon, with more channels planned next.

## Architecture

TIA Studio is built on a carefully selected stack that prioritizes developer experience and maintainability:

- **[Mastra](https://mastra.ai)** - Powers the assistant, team, and channel runtime, providing a clean abstraction for connecting AI models and managing agent lifecycles
- **[Assistant UI](https://www.assistant-ui.com/)** - Delivers the chat interface components, handling message rendering, streaming responses, and conversation state
- **Electron + React** - Provides the desktop application shell with a modern React-based UI
- **TypeScript** - Ensures type safety across the entire codebase

### Design Philosophy

We intentionally kept the architecture simple:

1. **Assistants as first-class citizens** - Each assistant (like TIA or Default Agent) is a Mastra agent with its own configuration, capabilities, and channel presence
2. **Teams and channels by design** - Teams help coordinate multiple assistants, while channels let an assistant operate where real conversations already happen
3. **Workspace-centric** - Conversations are organized into threads and team views, making it easy to context-switch between different tasks
4. **Minimal abstractions** - We use Mastra's primitives directly rather than building custom layers, and Assistant UI handles the chat UX without custom message components
5. **Local-first** - Everything runs on your machine, with no required cloud dependencies

## Features

- 🤖 Multiple AI assistants with different capabilities
- 👥 Teams for coordinating assistants in one workspace
- 📡 Channels that connect assistants to real conversations
- 🦾 OpenClaw-inspired local operators when an assistant is paired with a channel
- ✅ Lark support available today
- 🚧 Telegram and WhatsApp support coming very soon, with more channels next
- 💬 Thread-based conversation management
- 🎨 Clean, dark-themed interface
- 🔒 Local-first architecture
- ⚡ Fast, native desktop performance

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm run dev
```

### Building

```bash
# For macOS
pnpm run build:mac

# For Windows
pnpm run build:win

# For Linux
pnpm run build:linux
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

- `pnpm run dev` - Start development server
- `pnpm run build` - Build for production
- `pnpm run lint` - Run ESLint
- `pnpm run format` - Format code with Prettier
- `pnpm test` - Run tests

## License

MIT
