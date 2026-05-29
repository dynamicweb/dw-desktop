---
uid: Fundamentals.Code.DWDesktop
title: DW Desktop
---

# DW Desktop

DW Desktop is a cross-platform desktop application for managing Dynamicweb 10 solutions. It gives you a visual file browser for moving files between your local machine and a DW10 environment — without a terminal or FTP client.

It replaces the legacy CLI Uploader tool.

> [!NOTE]
> If you need to automate file transfers or run them from a CI/CD pipeline, use the [DynamicWeb CLI](https://github.com/dynamicweb/CLI) instead. DW Desktop is intended for interactive, manual use.

## Download

Get the latest version from the [Releases page](https://github.com/dynamicweb/dw-desktop/releases/latest).

| Platform | File |
|---|---|
| Windows (x64 — most PCs) | `dw-desktop-*-x64-setup.exe` |
| Windows (ARM64 — Snapdragon / Surface Pro X) | `dw-desktop-*-arm64-setup.exe` |
| macOS (Universal — Intel + Apple Silicon) | `dw-desktop-*.dmg` |
| Linux | `.AppImage` or `.deb` |

> [!NOTE]
> On macOS, the app is not yet notarized with Apple. On first launch, right-click the app and choose **Open** to bypass the Gatekeeper warning.

## What you can do

- Upload and download files between your local machine and a DW10 environment
- Browse remote files visually in a dual-pane interface
- Manage files directly on the server — rename, delete, and copy
- Work across multiple environments (dev, staging, production) with instant switching
- Track transfers with a full history log

## Getting started

### 1. Install the app

Download the installer for your platform from the [Releases page](https://github.com/dynamicweb/dw-desktop/releases/latest) and run it.

### 2. Add an environment

Click **+ Add environment** in the sidebar and fill in:

- **Name** — a label for this environment, e.g. *My solution – Staging*
- **Host** — the URL of your DW10 solution, e.g. `https://mysite.example.com`
- **Local start folder** *(optional)* — a default local folder to open for this environment

### 3. Choose an authentication method

Click **Next** to reach the Authentication step. Three methods are available.

#### OAuth (recommended)

Uses the OAuth 2.0 Client Credentials flow. No user password is stored; tokens are short-lived and automatically refreshed.

**Setup in DW10:**

1. Go to **Settings → System → Developer → OAuth Clients**
2. Click **Add client**
3. Set **Grant type** to **Client credentials**
4. Copy the generated **Client ID** and **Client secret** into the app

See also: [OAuth Clients](https://doc.dynamicweb.dev/manual/dynamicweb10/settings/system/developer/oauth.html)

#### API key

A static token tied to a specific DW10 user account. Use this when OAuth is not available on your solution version, or for quick testing. The key remains valid until you delete it manually.

**Setup in DW10:**

1. Go to **Settings → System → Developer → API Keys**
2. Click **Add API key**
3. Assign it to a user with sufficient file permissions
4. Copy the key into the app

See also: [API Keys](https://doc.dynamicweb.dev/manual/dynamicweb10/settings/system/developer/api-keys.html)

#### Username & password

Authenticates with a DW10 backend user account directly. Use this as a fallback when neither OAuth nor API keys are available. Not recommended for shared or long-running setups.

### 4. Start transferring files

Once the environment is saved, click it in the sidebar. The dual-pane browser opens with your local files on the left and the remote environment on the right.

- Drag files or folders between panes to transfer them
- Right-click items for options: rename, delete, copy
- Use the toolbar buttons to navigate folders

## Common scenario: copy a live site to staging

A typical use case is cloning a live environment to a staging environment for testing. The high-level steps are:

1. Add both the live and the staging environments in DW Desktop
2. In the live environment, trigger a database backup — place a `backup.txt` file in the designated system folder
3. Once the backup file appears, download the `Files` folder from live to your local machine
4. In the staging environment, clear the existing `Files` folder
5. Upload the locally downloaded `Files` folder to the staging environment root
6. Move the database backup file to the restore folder on staging to trigger a restore
7. After the restore, regenerate the staging API key or OAuth credentials — the restored database will contain the live credentials, which are different

> [!WARNING]
> Uploading large folder trees is done in batches of up to 300 files per request. Very large `Files` folders will take multiple batches and several minutes to complete.

## Transfer history

Every completed transfer is logged in the **History** panel. Use this for auditing what was uploaded or downloaded, or for debugging failed transfers.

## Credentials storage

Credentials (API keys, OAuth secrets, passwords) are stored in the native OS credential manager — Windows Credential Manager on Windows, Keychain on macOS, and libsecret on Linux. They are never stored in plain text on disk.

## Themes

DW Desktop supports light, dark, and system-follow themes. Change the active theme from the **Settings** menu.
