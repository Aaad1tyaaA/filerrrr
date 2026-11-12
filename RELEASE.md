# Release and signing

Filerrrr is an `.exe` desktop GUI. Users do not need to create an account, sign in, or use an AI service.

## Hosting

Installer repository: https://github.com/Aaad1tyaaA/filerrrr-releases

The 1.2.2 preview installer, blockmap, SHA256 checksums and dependency notices are published as a prerelease. It is unsigned. Its automatic update downloads are deliberately blocked; there is no published stable `latest.yml` yet.

## Publisher certificate

Code signing identifies the publisher to Windows; it is unrelated to an app login. Buying a publicly trusted certificate requires the publisher's identity verification and payment with the certificate authority. Neither has been completed. No self-signed certificate is presented as public trust.

Candidate: Certum Standard Code Signing in the Cloud, advertised from EUR 209 at review time. Final term, taxes and regional eligibility must be checked directly with the provider. SimplySign connects its cloud key to the Windows certificate store; the private key does not need to be exported or placed in Git.

Once a real issued certificate is accessible in `CurrentUser\My`, set `FILERRRR_SIGNING_THUMBPRINT` to its thumbprint and run:

```powershell
powershell -NoProfile -File scripts/build-signed-release.ps1
```

The script checks certificate validity, key availability and code-signing usage, aligns the Explorer MSIX publisher, signs and verifies that package, and builds with `forceCodeSigning`. The builder puts the full certificate subject into the update configuration and signs the app/installer. The script verifies those outputs and uploads nothing. The real certificate/HSM path still needs end-to-end validation after issuance.

## Update behavior

Settings includes automatic checks, download progress, and a user-controlled Restart and install action. There is no automatic install on quit. Active foreground or watch-folder conversions block restart.

Update downloads are enabled only in a packaged app whose embedded GitHub provider, owner, repository and publisher identity match the configured policy. Windows Authenticode verification must return a valid signature with the same full publisher subject; unavailable verification, malformed responses or a different publisher fail closed. Unsigned previews cannot silently install updates.

For the first signed stable release, bump the app version, build and test the signed installer, then publish the verified `.exe`, its `.blockmap`, checksums, notices and generated `latest.yml` as a normal GitHub release. Verify the live assets and test an update from an older signed installation. Do not publish update metadata for the unsigned preview or claim that the mock update tests establish a real signed upgrade.

Signing helps identify the publisher and build reputation; it does not guarantee that SmartScreen warnings disappear on the first download. A validly signed Explorer MSIX uses normal per-user registration; the unsigned fallback still asks for administrator approval.

## Current verification

86 Node tests and 17 Electron checks pass, plus whole-app sandboxed conversion/worker and packaged PDF/OCR checks. The finished 1.2.2 installer payload matches all 52 runtime files and the native drop DLL. Installer SHA256: `21f5d38e146747542bd17a6fb24abe0f77e2a7faf038e6c1c8862992b84edf48`.

Physical Ctrl+drag/cross-monitor acceptance is pending a user-operated test. Computer control cannot hold Ctrl across a drag; an isolated packaged app and disposable Explorer fixture have been opened. This boundary is separate from the automated two-display placement checks.

References: https://shop.certum.eu/standard-code-signing-in-the-cloud.html and https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
