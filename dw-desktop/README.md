# dw-desktop

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

On Linux, Electron also needs a few system libraries at runtime. If launch fails with a message like `error while loading shared libraries`, install the missing packages first.

Ubuntu 24.04 and newer:

```bash
$ sudo apt install -y libnspr4 libnss3 libasound2t64 libsecret-1-0
```

Older Ubuntu or Debian releases:

```bash
$ sudo apt install -y libnspr4 libnss3 libasound2 libsecret-1-0
```

This app also disables Chromium hardware acceleration on Linux by default because some Mesa and virtualized setups fail with shared-image GPU errors. If your machine has a stable GPU stack and you want to opt back in, launch with:

```bash
$ ELECTRON_ENABLE_LINUX_GPU=1 npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
