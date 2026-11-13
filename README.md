# Filerrrr

Convert files on your PC without uploading them anywhere. Hold **Ctrl**, drag a file in File Explorer, and pick a format on the palette that opens at your cursor. Or right-click a file → **Convert with Filerrrr**.

**[Download for Windows](https://github.com/Aaad1tyaaA/filerrrr-releases/releases/latest)** · [Website](https://aaad1tyaaa.github.io/filerrrr/)

- Images, PDFs, Word/Excel/PowerPoint, Markdown, data (JSON, YAML, CSV…), archives, fonts, video and audio
- Best quality by default; originals are never changed; Undo sends results to the Recycle Bin
- Optional engines (video & audio, PDF pages & Photoshop, scanned-text recognition) download only if you want them, from their official sources, checked by SHA256
- Presets, watch folders, crop / trim / PDF-page editors, batch conversion with cancel
- Works offline; no account, no telemetry

Windows 10/11 x64. The installer is not code-signed, so Windows may show an "unknown publisher" warning.

## Build from source

Windows x64 with Node.js 22+, Visual Studio C++ Build Tools and the Windows SDK.

```powershell
npm ci
npm run native      # drop-target DLL
npm run menu        # Windows 11 Explorer menu DLL and package
npm start
```

Tests and packaging:

```powershell
npm test                 # Node tests
npm run test:electron    # Electron checks
npm run test:e2e         # real Ctrl+drag from Explorer (moves the mouse for ~2 minutes)
npm run dist             # Setup, portable ZIP and engine manifest in release/
```

See [RELEASE.md](RELEASE.md) for how engines are pinned and verified. Third-party notices are in `THIRD-PARTY-NOTICES.txt`.

## Licence

[MIT](LICENSE)
