# Filerrrr unsigned releases

Filerrrr is an `.exe` desktop GUI. Users do not need to create an account, sign in, or use an AI service.

The user has chosen not to purchase a signing certificate. Version 1.2.3 is intentionally unsigned; a paid certificate is not a prerequisite or an outstanding purchase task. Windows may show an unknown-publisher or SmartScreen warning.

## Hosting

Installer repository: https://github.com/Aaad1tyaaA/filerrrr-releases

Version 1.2.3 uses manual downloads from Releases. Installer, blockmap, SHA256 checksums and dependency notices are published together after validation. No stable `latest.yml` is published for unsigned builds.

## Optional publisher signing

The normal build works without signing credentials: run `npm ci`, then `npm run dist` on Windows with Visual Studio C++ Build Tools and the Windows SDK. No self-signed certificate or security-setting change is used to disguise the unsigned build.

The following signing tools are optional development infrastructure, outside the current unsigned delivery. They are not required to build, install or use Filerrrr.

Once a real issued certificate is accessible in `CurrentUser\My`, set `FILERRRR_SIGNING_THUMBPRINT` to its thumbprint and run:

```powershell
powershell -NoProfile -File scripts/build-signed-release.ps1
```

The script checks certificate validity, key availability and code-signing usage, aligns the Explorer MSIX publisher, signs and verifies that package, and builds with `forceCodeSigning`. The builder puts the full certificate subject into the update configuration and signs the app/installer. The script verifies those outputs and uploads nothing. The real certificate/HSM path still needs end-to-end validation after issuance.

## Update behavior

Settings shows manual updates and an Open releases button. Download the latest installer and run it when ready. Certificate-waiting messages and unavailable automatic-update controls are hidden. There is no background update download or automatic installation in an unsigned build.

The dormant signed-updater path still requires a matching embedded publisher identity and a valid Windows signature; its protections have not been disabled to allow unsigned automatic installation. Unavailable verification, malformed responses or a different publisher fail closed.

If signed distribution is chosen in the future, build and test the signed installer before publishing update metadata. Test an update from an older signed installation; mock update tests do not establish a real signed upgrade. This is not a gate for the current unsigned manual-download release.

Signing helps identify the publisher and build reputation; it does not guarantee that SmartScreen warnings disappear on the first download. A validly signed Explorer MSIX uses normal per-user registration; the unsigned fallback still asks for administrator approval.

## Current verification

87 Node tests and 17 Electron checks pass, including the unsigned manual-update path. Packaged executable and finished-installer checks are recorded separately under `D:\filerrrr\.tools\unsigned-1.2.3-*`. Historical 1.2.2 validation remains in the earlier evidence files.

The finished Full installer is `release/Filerrrr-Setup-1.2.3.exe`, 208,134,079 bytes (198.49 MiB). Its 52 runtime files and native drop DLL match the current source; Windows reports `NotSigned`, as intended. SHA256: `a413ae03e4cb1132ef915a39c862b6aecbdd8e19b65c013206c704cc1a683b05`. The prepared executable passes actual worker conversion and whole-app manual-update/conversion checks.

On 12 November 2026, the user confirmed successful physical Ctrl+drag conversion on both monitors. This is recorded as user-confirmed acceptance, separate from the automated two-display placement checks. Follow-up inspection of the isolated fixture folder found the original sample but no HTML output, recorded history or gesture trace, so the physical result was not independently verified from those artifacts.

References: https://shop.certum.eu/standard-code-signing-in-the-cloud.html and https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
