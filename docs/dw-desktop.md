---
uid: Fundamentals.Code.DWDesktop
title: DW Desktop
---

# DW Desktop

DW Desktop is a cross-platform desktop application for moving files between your computer and a Dynamicweb 10 solution. You browse both side by side, deploy a local folder to the server with a preview of every change, and get files that are missing or newer on the server back to your computer — without a terminal or FTP client.

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

## Requirements

The solution must run a Dynamicweb 10 version that includes the **File Transfer API** (`/Admin/Api/FileTransfer`). DW Desktop uses it for everything: listing, uploads, downloads, sync and file management. When you add an environment, DW Desktop tests the connection and tells you if the solution does not expose the API.

## The app at a glance

The sidebar on the left holds:

- **The environment switcher** at the top — the solution you are working with. Open it to switch environment, add one, or manage them.
- **Browse**, **Sync** and **Activity** — the three main views.
- **Pinned** and **Recent** server folders, and your **saved syncs**, for the current environment.
- **Settings** at the bottom — environments and theme.

## Getting started

### 1. Install the app

Download the installer for your platform from the [Releases page](https://github.com/dynamicweb/dw-desktop/releases/latest) and run it.

### 2. Add an environment

Open the environment switcher at the top of the sidebar and choose **Add environment**. On first launch you can also use **Add environment** in the server pane. Fill in:

- **Name** — a label for this environment, e.g. *My solution – Staging*
- **Host** — the URL of your DW10 solution, e.g. `https://mysite.example.com`
- **Environment type** — *Production*, *Staging* or *Development*. Production environments are marked in red and show a warning before you deploy to them.
- **Local start folder** *(optional)* — the local folder to open for this environment

You can edit or remove environments later under **Settings**, or from **Manage environments** in the switcher.

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

## Browse

**Browse** shows **This computer** on the left and the server (labelled with the environment name) on the right. Server paths start at `/Files`.

- **Navigate** by double-clicking folders, with the breadcrumb, the up arrow, or the pencil button to type a path. Mouse back/forward buttons work too.
- **Transfer** by dragging files or folders from one pane to the other, or onto a folder in the other pane. You can also drop files from your file explorer onto the server pane, or use the upload button in its header.
- **Manage server files** from a row's **···** menu (or right-click): **Download**, **Rename**, **Move to folder…**, **Copy path**, **Delete**, and **Pin** a folder to the sidebar. You can also drag a server entry onto a server folder to move it. The folder-plus button in the server pane header creates a new folder.
- **On this computer**, a row's menu offers upload to the server, show in your file explorer, and copy path.
- **Filter** the current folders by name with **Filter this folder**, and sort by clicking a column header.

If an upload would replace files that already exist on the server, DW Desktop asks first: **Replace existing**, **Upload missing only**, or cancel. When the environment is Production, the dialog says so.

When you upload a folder, common junk inside it is left out: `.git`, `.svn`, `.hg` and `node_modules` folders, `.DS_Store`, `Thumbs.db`, `desktop.ini`, `*.tmp`, `~$*` (Office lock files), `*.swp`, and `*.dwpart` (unfinished DW Desktop downloads). Activity lists what was left out. A file you upload on its own is always sent, whatever its name.

### Compare

When the two panes show matching folders — the local folder is inside a `Files` folder at the same relative path as the server folder — they are compared automatically. Files are marked **Changed**, **Not on server** or **Only on server**, and the filter pills above the panes show only those. Use the compare menu to compare any two folders, or to switch comparing off.

### Linked folders

With **Folders linked** on, the two panes navigate together while their folders match. When they don't, arrow buttons open the matching folder on the other side.

## Sync

Sync makes one folder match another, with a preview before anything is written. It is the tool for deploying, and for getting what is missing on your computer.

1. In **Browse**, open the two folders and click **Sync folder** — or open **Sync** and pick the folders there.
2. Choose a direction: **Deploy to server** (this computer → server) or **Get from server** (server → this computer).
3. Choose options:
   - **Compare content, not just size and date** — slower, but exact (uses SHA-256 checksums). Without it, files are compared by size and date, and files the last sync uploaded or downloaded are recognised, so they aren't sent again.
   - **Delete files that aren't on the other side** — off by default. Deletes on your computer go to the recycle bin / trash.
   - **Skip common junk files** — on by default. See [Excluding files](#excluding-files).
   - **Skip files listed in .gitignore** — shown when the local folder is in a Git repository with a `.gitignore`. Off by default.
   - **Exclude patterns** — your own rules for this sync.
4. Click **Preview changes**. Every file that would be uploaded, downloaded, replaced or deleted is listed with the reason. Untick anything you don't want.
5. Run it. Progress shows in **Activity**.

### Conflicts

DW Desktop remembers what each sync wrote or verified. If a file changed on **both** sides since the last sync — for example, someone edited it on the server after your last deploy — the preview marks it as a **conflict** and leaves it out until you choose which version to keep. Nothing changed by someone else is overwritten silently.

A replace or delete is also guarded at the moment it runs: if the server file changed after you previewed, it is not overwritten, and the item reports that you should preview again.

### Excluding files

Excluded files are left alone on **both** sides: they are not transferred, and with *delete* turned on they are not deleted either. A folder that contains an excluded file is never deleted as a whole; the rest of its contents are deleted one by one. The preview lists what was excluded, on which side, and by which rule, under **Excluded**.

Rules come from these places. When rules disagree, the later one in this list wins:

1. **Common junk files** (unless you turn this off): `.git/`, `.svn/`, `.hg/`, `node_modules/`, `.DS_Store`, `Thumbs.db`, `desktop.ini`, `*.tmp`, `~$*`, `*.swp`, `*.dwpart`.
2. **`.gitignore` files** (only when **Skip files listed in .gitignore** is on): those from the repository root down to the local folder, and those in its subfolders.
3. **`.dwignore`** in the local folder, if there is one. It is useful for rules your whole team should share, and it is never uploaded itself.
4. **Exclude patterns** for this sync.

Patterns use `.gitignore` syntax and ignore case:

| Pattern | Matches |
| --- | --- |
| `*.scss` | any `.scss` file, in any folder |
| `drafts/` | any folder named `drafts`, and everything in it |
| `/drafts/` | only the `drafts` folder at the top of the synced folder |
| `Designs/**/*.map` | `.map` files anywhere below `Designs` |
| `!keep.tmp` | brings back a file an earlier rule excluded |
| `# note` | a comment |

A file inside an excluded folder can't be brought back on its own: un-exclude the folder too (for example `!node_modules/`).

> [!NOTE]
> A `.gitignore` often lists build output, such as compiled CSS and JavaScript, that the site *does* need. Check the **Excluded** list before you deploy with **Skip files listed in .gitignore** on. Add a `!` pattern to bring something back.

`System/Log` and `Cache.net` under `/Files` are never synced, the same as in the Dynamicweb CLI. That keeps a full **Get** from downloading logs and cache, and a full **Deploy** with *delete* from removing them. To sync them anyway, choose that folder itself as the server folder.

### Saved syncs

Click **Save this sync** to keep the folders, direction, options and exclude rules. Saved syncs appear in the sidebar for the environment; click one to open it in Sync and preview again.

## Activity

**Activity** lists every upload, download and sync, grouped by batch, with progress. A small progress pill at the bottom right shows running transfers while you work in other views; click it to open Activity.

- **Cancel all** stops a running batch. Expand a batch to cancel a single file — the rest of the batch keeps going. A delete started from Browse is one request and can't be cancelled.
- **Retry failed** runs the failed and cancelled items of a batch again. A sync item keeps its safeguard: a server file is only replaced or deleted if it hasn't changed since the preview, otherwise the item fails again and asks you to preview the sync again.
- **Clear finished** removes completed batches. Failed batches stay until you retry them.
- Use the environment menu to show this environment only or all environments.
- **Server requests** shows the raw requests to the server, for troubleshooting.

The history is kept for 30 days (up to 500 transfers). If DW Desktop closes while a transfer is running, it shows as **Interrupted** the next time you open the app, and you can retry it.

## How transfers work

All transfers use the Dynamicweb 10 File Transfer API:

- Large files upload in chunks, each verified with a checksum; the whole file is verified when it completes.
- Several files transfer in parallel.
- Interrupted downloads resume where they stopped.
- Temporary network and server errors are retried automatically, and retries can't apply a change twice.
- Folders of any size are listed in full.

## Common scenario: copy a live site to staging

A typical use case is cloning a live environment to a staging environment for testing. The high-level steps are:

1. Add both the live and the staging environments in DW Desktop.
2. In the live environment, trigger a database backup — place a `backup.txt` file in the designated system folder.
3. Once the backup file appears, use **Sync** with **Get from server** to download the live `Files` folder to a local folder.
4. Switch to the staging environment and use **Sync** with **Deploy to server** from that local folder to the staging `/Files` folder. Turn on **Delete files that aren't on the other side** to remove files that exist only on staging, and check the preview before you run it.
5. Move the database backup file to the restore folder on staging to trigger a restore.
6. After the restore, regenerate the staging API key or OAuth credentials — the restored database will contain the live credentials, which are different.

> [!WARNING]
> A full `Files` folder can contain many thousands of files. Building the preview with **Compare content** on reads every file's checksum and takes longer; the transfer itself runs several files in parallel and shows progress per file in **Activity**.

## Credentials storage

Credentials (API keys, OAuth secrets, passwords) are stored in the native OS credential manager — Windows Credential Manager on Windows, Keychain on macOS, and libsecret on Linux. They are never stored in plain text on disk.

## Themes

DW Desktop supports light, dark, and follow-the-system themes. Change it under **Settings**.
