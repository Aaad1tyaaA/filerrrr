# One real Ctrl + drag of a file out of an Explorer window, with real mouse and keyboard input (SendInput).
#  -Dx/-Dy:   where to rest relative to the point the palette opened (0,0 = on the disc)
#  -Wheel:    wheel notches down while resting      -Keys: letters typed while resting
#  -Tab:      press Tab first (tools face)           -LetGoCtrl: release Ctrl before dropping
param([string]$Folder, [string]$Name, [int]$Dx = 0, [int]$Dy = 0, [int]$Wheel = 0, [string]$Keys = "", [int]$Tab = 0, [int]$LetGoCtrl = 0)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class U {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, int d, IntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte s, uint f, IntPtr e);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int hh, uint f);
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string t);
}
"@
[U]::SetProcessDPIAware() | Out-Null
$B = [System.Windows.Forms.SystemInformation]::VirtualScreen
function MoveTo($px, $py) { [U]::mouse_event(0xC001, [int](($px - $B.X) * 65535 / ($B.Width - 1)), [int](($py - $B.Y) * 65535 / ($B.Height - 1)), 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 30 }
function Key($vk, $scan = 0) { [U]::keybd_event($vk, $scan, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 30; [U]::keybd_event($vk, $scan, 2, [IntPtr]::Zero); Start-Sleep -Milliseconds 220 }

# put the Explorer window in the middle of the primary screen so the palette has room on every side
$leaf = Split-Path $Folder -Leaf
if ([U]::FindWindow('CabinetWClass', $leaf) -eq [IntPtr]::Zero) { Start-Process explorer.exe $Folder; Start-Sleep 2 }
for ($i = 0; $i -lt 20; $i++) { $h = [U]::FindWindow('CabinetWClass', $leaf); if ($h -ne [IntPtr]::Zero) { break }; Start-Sleep -Milliseconds 250 }
if ($h -ne [IntPtr]::Zero) { [U]::SetWindowPos($h, [IntPtr]::Zero, [int]($B.Width * .3), [int]($B.Height * .25), 900, 600, 0x0040) | Out-Null; Start-Sleep -Milliseconds 600 }
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $Name)
$item = $null
for ($i = 0; $i -lt 25 -and -not $item; $i++) {
  foreach ($a in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)) {
    if ($a.Current.ControlType.ProgrammaticName -eq 'ControlType.ListItem') { $item = $a; break }
  }
  if (-not $item) { Start-Sleep -Milliseconds 300 }
}
if (-not $item) { throw "Explorer item $Name not found" }
$r = $item.Current.BoundingRectangle
$x = [int]($r.X + 30); $y = [int]($r.Y + $r.Height / 2)

[U]::SetCursorPos($x, $y); Start-Sleep -Milliseconds 250
[U]::keybd_event(0xA2, 0x1D, 0, [IntPtr]::Zero)                  # Left Ctrl down (like a real keyboard)
[U]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)                # left button down
MoveTo ($x + 4) ($y + 2); MoveTo ($x + 8) ($y + 4)               # past the threshold: the palette opens here
$ox = $x + 8; $oy = $y + 4
Start-Sleep -Milliseconds 300
for ($k = 1; $k -le 10; $k++) { MoveTo ($ox + $Dx * $k / 10) ($oy + $Dy * $k / 10) }
for ($k = 0; $k -lt 6; $k++) { MoveTo ($ox + $Dx + ($k % 2)) ($oy + $Dy) }   # rest (tiny moves keep OLE's DragOver coming)
if ($Tab) { Key 0x09 }
for ($k = 0; $k -lt $Wheel; $k++) { [U]::mouse_event(0x0800, 0, 0, -120, [IntPtr]::Zero); Start-Sleep -Milliseconds 250 }
foreach ($ch in $Keys.ToUpper().ToCharArray()) { Key ([byte][char]$ch) }
if ($LetGoCtrl) { [U]::keybd_event(0xA2, 0x1D, 2, [IntPtr]::Zero); for ($k = 1; $k -le 4; $k++) { MoveTo ($ox + $Dx + $k * 3) ($oy + $Dy) } }
for ($k = 0; $k -lt 3; $k++) { MoveTo ($ox + $Dx + ($k % 2)) ($oy + $Dy) }
Start-Sleep -Milliseconds 300
[U]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)                # drop
[U]::keybd_event(0xA2, 0x1D, 2, [IntPtr]::Zero)                  # Ctrl up
