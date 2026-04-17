# Truvio Commerce Cloud Desktop

A cross-platform desktop application for managing [Dynamicweb 10](https://www.dynamicweb.com) solutions — file transfers, environment management, and remote file browsing, all without needing a terminal.

![DW Desktop — light mode](dw-desktop/docs/screenshot-light.png)
![DW Desktop — dark mode](dw-desktop/docs/screenshot-dark.png)

---

## Download

Get the latest version from the [Releases page](https://github.com/dynamicweb/dw-desktop/releases/latest).

| Platform | Download |
|---|---|
| **Windows** (x64 — most PCs) | `dw-desktop-*-x64-setup.exe` |
| **Windows** (ARM64 — Snapdragon / Surface Pro X) | `dw-desktop-*-arm64-setup.exe` |
| **macOS** (Universal — Intel + Apple Silicon) | `dw-desktop-*.dmg` |
| **Linux** | `.AppImage` or `.deb` |

> **macOS note:** The app is not yet notarized with Apple. On first launch, right-click the app and choose **Open** to bypass the Gatekeeper warning.

---

## What you can do

- Move files between your local machine and DW10 environments
- Browse and manage remote files visually
- Work across multiple environments (dev, staging, production)
- Handle large transfers with progress tracking and logs


## Key features

- **Dual-pane file browser**  
  Local files on one side, remote environment on the other

- **Drag & drop transfers**  
  Upload and download files with real-time progress

- **Batch operations**  
  Move entire folders or multiple files in one go

- **Remote file management**  
  Rename, delete, and copy files directly in the environment

- **Multiple environments**  
  Switch instantly between your DW10 setups

- **Flexible authentication**  
  API key, OAuth, or username/password

- **Transfer history**  
  Full log of everything that moved — useful for debugging and traceability

- **Cross-platform**  
  Runs on Windows, macOS, and Linux

- **Theme support**  
  Light, dark, or follow your OS



## When to use it

DW Desktop is ideal when you need to:

- Deploy files to a staging or production environment
- Pull files down for debugging or local development
- Quickly inspect or fix something directly on a remote instance
- Work across multiple environments without juggling credentials or tools

## Getting started

Download the app, add your environment, and you’re ready to go.

No additional setup required.


## Contributing

Contributions are welcome. The app is built with Electron + Vite + React + TypeScript.

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm (comes with Node.js)

### Clone and install

```bash
git clone https://github.com/dynamicweb/dw-desktop.git
cd dw-desktop
npm install
```

### Run in development

```bash
npm run dev
```

This starts the Electron app with hot-reload for the renderer process.

### Type checking

```bash
npm run typecheck
```

### Build a distributable

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

### Linux runtime dependencies

If the app fails to launch on Linux with a shared-library error, install the missing system packages:

**Ubuntu 24.04+**
```bash
sudo apt install -y libnspr4 libnss3 libasound2t64 libsecret-1-0
```

**Older Ubuntu / Debian**
```bash
sudo apt install -y libnspr4 libnss3 libasound2 libsecret-1-0
```

### Tech stack

| Layer | Technology |
|||
| Shell | Electron |
| Bundler | electron-vite |
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Credential storage | keytar |

### IDE setup

[VSCode](https://code.visualstudio.com/) with the [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) and [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extensions is recommended.
