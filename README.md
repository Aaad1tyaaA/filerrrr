# Filerrrr

An English-only Windows desktop app for local file conversion. The GUI includes the matrix palette, Explorer integration, progress and cancellation, result actions, output preferences, presets, watch folders and focused image/media/PDF editors. A public command-line interface and AI tools are outside the current product scope.

## Develop

Use Windows x64 with Node.js, npm, Visual Studio C++ Build Tools and the Windows SDK.

```powershell
npm ci
npm run native
npm run menu
npm start
```

Source is self-contained in this folder; the retired .NET projects are not needed. Generated installers, dependencies, native build outputs, logs and credentials are excluded from Git. `package-lock.json` records JavaScript dependency versions. Build the native DLLs again after a fresh checkout.

## Verify and package

```powershell
npm test
npm run test:electron
npm run test:app
npm run dist
npm run test:packaged
node tests/packaged-worker.cjs
node tests/installer-payload.cjs release/Filerrrr-Setup-1.2.1.exe
```

The Full installer includes the bundled offline engines. Core uses the matching, checksum-verified engine ZIP for media, OCR, PDF rendering and PSD support. Additional-format applications such as LibreOffice, Calibre, ImageMagick and rhwp are separate and can be connected in Settings. The built-in PPTX fallback exports slide text; advanced CAD coverage is limited.

Loose-file packaging is intentional: previous packaged measurements found lower idle memory with this layout. Turning ASAR on requires fresh packaged native-module, PDF/OCR, worker and engine-pack tests. An archive is not a security boundary or code signing.

No signing certificate, public update feed or remote Git repository is configured. Do not treat a local build or a generated winget manifest as a published release. Third-party notices are bundled in `THIRD-PARTY-NOTICES.txt`; dependency licence files remain with the installed packages.
