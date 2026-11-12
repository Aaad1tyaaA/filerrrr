// "Convert with Filerrrr" at the top of the Windows 11 File Explorer menu.
// A sparse package (Filerrrr.ExplorerMenu.msix) registers filerrrr_menu.dll, both next to Filerrrr.exe.
// Windows only accepts an unsigned package with a COM server from an administrator, so adding it asks for
// one approval; its version is fixed, so app updates keep it (the DLL updates with the app).
const { execFile } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const NAME = 'Filerrrr.ExplorerMenu';
const CLSID = 'C1D5D6B0-3F0E-4E8A-9A5B-6F7E2A1C4B11';
const files = dir => ({ dll: path.join(dir, 'filerrrr_menu.dll'), msix: path.join(dir, `${NAME}.msix`) });
const supported = (release = os.release()) => process.platform === 'win32' && Number(release.split('.')[2]) >= 22000;
const available = dir => supported() && fs.existsSync(files(dir).dll) && fs.existsSync(files(dir).msix);

const quote = s => `'${String(s).replace(/'/g, "''")}'`; // PowerShell single-quoted string
const encode = script => Buffer.from(script, 'utf16le').toString('base64');
// Runs `inner` as administrator (one UAC prompt). Exit 0 = done, 1223 = the prompt was declined, else failed.
const elevated = inner => `try { $p = Start-Process powershell -Verb RunAs -WindowStyle Hidden -PassThru -Wait -ArgumentList '-NoProfile','-EncodedCommand','${encode(`try { ${inner} -ErrorAction Stop; exit 0 } catch { exit 1 }`)}'; exit $p.ExitCode } catch { exit 1223 }`;
const registerScript = dir => `if ((Get-AuthenticodeSignature -LiteralPath ${quote(files(dir).msix)}).Status -eq 'Valid') { try { Add-AppxPackage -Path ${quote(files(dir).msix)} -ExternalLocation ${quote(dir)} -ErrorAction Stop; exit 0 } catch { exit 1 } } else { ${elevated(`Add-AppxPackage -Path ${quote(files(dir).msix)} -ExternalLocation ${quote(dir)} -AllowUnsigned`)} }`;
const unregisterScript = () => `Get-AppxPackage -Name ${NAME} | Remove-AppxPackage -ErrorAction Stop`;
const repairScript = dir => `Get-AppxPackage -Name ${NAME} | Where-Object { $_.Status -eq 'Ok' } | ForEach-Object { Add-AppxPackage -Register (Join-Path $_.InstallLocation 'AppxManifest.xml') -DisableDevelopmentMode -ExternalLocation ${quote(dir)} -ErrorAction Stop }`;

function ps(script) {
  return new Promise(res => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true },
    (e, out, err) => res({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, out: String(out || '').trim(), err: String(err || '').trim() })));
}
const firstLine = s => String(s || '').split(/\r?\n/).map(l => l.trim()).find(Boolean) || '';
// Whether the package is registered at all (the user added the menu), whatever state its handler is in.
async function isPresent() { return supported() && (await ps(`(Get-AppxPackage -Name ${NAME}).Status`)).out === 'Ok'; }
async function isRegistered() {
  if (!supported()) return false;
  // Package Status can remain Ok after an update even when Explorer gets E_ACCESSDENIED loading its COM handler.
  return (await ps(`if ((Get-AppxPackage -Name ${NAME}).Status -eq 'Ok') { try { $handler = [Activator]::CreateInstance([Type]::GetTypeFromCLSID([guid]'${CLSID}')); [Runtime.InteropServices.Marshal]::FinalReleaseComObject($handler) | Out-Null; 'Ok' } catch {} }`)).out === 'Ok';
}
// → { ok, present, repaired, detail }: ok = Explorer can load the handler; present = the user added the menu;
// repaired = this call fixed it; detail = why it is still broken.
async function repair(dir) {
  if (!available(dir)) return { ok: false, present: false, repaired: false, detail: 'The menu files are missing next to Filerrrr.exe' };
  if (await isRegistered()) return { ok: true, present: true, repaired: false, detail: '' };
  if (!await isPresent()) return { ok: false, present: false, repaired: false, detail: '' }; // never added, or removed on purpose
  // Re-register the existing package for this user; no administrator approval needed.
  const r = await ps(repairScript(dir));
  if (r.code === 0 && await isRegistered()) return { ok: true, present: true, repaired: true, detail: '' };
  return { ok: false, present: true, repaired: false, detail: firstLine(r.err) || firstLine(r.out) || (r.code ? `PowerShell exited with ${r.code}` : 'Explorer still cannot load the menu handler') };
}
// → 'added' | 'declined' | 'failed'
async function add(dir) {
  if (!available(dir)) return 'failed';
  const { code } = await ps(registerScript(dir));
  return code === 0 && await isRegistered() ? 'added' : code === 1223 ? 'declined' : 'failed';
}
// Removing usually works without admin rights; if not, ask once.
async function remove() {
  if ((await ps(unregisterScript())).code !== 0) await ps(elevated(unregisterScript().replace(' -ErrorAction Stop', '')));
  return !(await isRegistered());
}

module.exports = { NAME, files, supported, available, registerScript, unregisterScript, repairScript, isPresent, isRegistered, repair, add, remove };
