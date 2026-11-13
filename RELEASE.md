# Filerrrr releases

Filerrrr is a Windows desktop app (an `.exe`). No account, no sign-in, no AI service. Releases are unsigned by choice: Windows may show an "unknown publisher" warning on install.

## 1.3.0

| File | What it is |
|---|---|
| `Filerrrr-1.3.0-Setup.exe` (~111 MB) | Installer: for this user (no admin) or for all users (admin). |
| `Filerrrr-1.3.0-win.zip` (~161 MB) | Portable copy: unzip and run `Filerrrr.exe`. |

### Engines

The installer carries everything for images, documents, spreadsheets, PDFs (text), data, archives and fonts. Three larger engines are optional:

| Engine | Download | Official source |
|---|---|---|
| Video & audio (FFmpeg) | ~28 MB | `github.com/eugeneware/ffmpeg-static` release `b6.1.1` |
| PDF pages & Photoshop (Skia canvas) | ~15 MB | npm `@napi-rs/canvas-win32-x64-msvc` |
| Scanned text recognition (Tesseract.js + English model) | ~29 MB | npm `tesseract.js-core`, `@tesseract.js-data/eng` |

- **Choosing:** Setup's "Choose conversion engines" page (fresh installs; small ones pre-ticked), the first-run question when nothing was chosen in Setup, and Settings → Engines at any time (install, cancel, remove).
- **Downloading:** at first start, in the background, one engine after another, with a Windows notification when each is ready. Nothing is hosted by Filerrrr.
- **Checking:** `engine-pack-manifest.json` pins each official archive (URL, size, SHA256) and every file inside it. A download that differs by one byte is discarded. `npm run engines` rebuilds the manifest and fails if an official file differs from the tested copy.
- **Found on this PC:** an FFmpeg on `PATH` with the encoders Filerrrr needs (libx264, libmp3lame, libopus, libvpx-vp9) is used instead of downloading one.
- **Offline PCs:** Settings → Engines → "Install from a downloaded pack…" accepts the `release/engines/Filerrrr-Engine-*.zip` files, checked the same way.
- **Updates and uninstall:** engines live in `%APPDATA%\Filerrrr\engines`, so updates keep them; a real uninstall removes them (settings and history stay).

### Also new

- Best quality is the default (lossless WEBP from lossless sources, 4:4:4 JPG, 320 kbps audio, 300 dpi PDF pages). Profiles still on the old untouched defaults move to Best once.
- Results say where the file was saved; the taskbar shows progress and flashes when a conversion finishes in the background.
- PDF → DOCX / Markdown / TXT / HTML works without any engine for PDFs that contain text.
- "What's new" appears once after an update (`whats-new.json`).
- New Dot F logo and installer artwork.

## Building

```powershell
npm ci
npm test                 # Node tests
npm run test:electron    # Electron checks
npm run dist             # engines manifest, Setup and portable ZIP in release/
```

Needs Windows with Visual Studio C++ Build Tools and the Windows SDK (for the Explorer menu and drop-target DLLs). `npm run dist:full` builds an older-style installer with every engine inside.

## Updates

Manual: Settings shows "Open releases". Download the new Setup and run it; settings, history and engines are kept. There is no automatic installation for unsigned builds.
