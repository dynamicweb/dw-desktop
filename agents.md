# DW Desktop — Agent Context

This file is the shared project context for coding agents working in this repository.
`agents.md` is the source of truth. `CLAUDE.md` imports this file so Claude reads the same guidance.

## What this project is

A cross-platform desktop application (Mac, Windows, Linux) built with **Electron + Vite + React + TypeScript** that provides a GUI for managing Dynamicweb 10 solutions — primarily as an FTP replacement for file operations. It talks directly to the DW Management API (the same API the `@dynamicweb/cli` wraps).

This repository currently centers on one checked-in app project plus one reference project that may exist outside the current checkout:

- **`dw-desktop/`** — Active development: Electron desktop GUI for DynamicWeb 10 management (file transfers, environments, authentication, add-in installs, etc.)
- **`CLI (reference)/`** — Read-only reference: existing DynamicWeb CLI that documents the Management API patterns, auth flows, and command behavior that `dw-desktop` should mirror when that reference source is available.
The CLI is the reference implementation. When in doubt about how an operation works, the CLI source is authoritative.
---
