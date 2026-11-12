# Right-clicks a file in File Explorer and lists the Windows 11 menu's entries (UI Automation).
# Usage: menu.ps1 [-Invoke]   -Invoke clicks "Convert with Filerrrr" as well.
param([switch]$Invoke)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class M {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, int d, IntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte s, uint f, IntPtr e);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int hh, uint f);
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@
[M]::SetProcessDPIAware() | Out-Null
$dir = Join-Path $env:TEMP 'filerrrr-menu-test'; New-Item -ItemType Directory $dir -Force | Out-Null
Set-Content (Join-Path $dir 'sample.txt') 'hello'
Start-Process explorer.exe "/separate,`"$dir`""; Start-Sleep 3 # its own process: a fresh shell-extension cache
$h = [M]::FindWindow('CabinetWClass', 'filerrrr-menu-test')
$B = [System.Windows.Forms.SystemInformation]::VirtualScreen
[M]::SetWindowPos($h, [IntPtr]::Zero, [int]($B.Width * .25), [int]($B.Height * .2), 900, 600, 0x0040) | Out-Null; Start-Sleep 1
$A = [System.Windows.Automation.AutomationElement]
$item = $null
for ($i = 0; $i -lt 20 -and -not $item; $i++) {
  foreach ($e in $A::RootElement.FindAll('Descendants', (New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, 'sample.txt')))) {
    if ($e.Current.ControlType.ProgrammaticName -eq 'ControlType.ListItem') { $item = $e; break } }
  if (-not $item) { Start-Sleep -Milliseconds 300 }
}
[M]::keybd_event(0x12, 0, 0, [IntPtr]::Zero); [M]::keybd_event(0x12, 0, 2, [IntPtr]::Zero) # an Alt tap lets us take the foreground
[M]::SetForegroundWindow($h) | Out-Null; Start-Sleep -Milliseconds 400
$item.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select(); $item.SetFocus(); Start-Sleep -Milliseconds 400
[M]::keybd_event(0x5D, 0, 0, [IntPtr]::Zero); [M]::keybd_event(0x5D, 0, 2, [IntPtr]::Zero); Start-Sleep 2   # the menu key opens the file's menu
for ($i = 0; $i -lt 10; $i++) { # the menu fills in over a second or two
  $items = $A::RootElement.FindAll('Descendants', (New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::MenuItem)))
  $names = @($items | ForEach-Object { $_.Current.Name } | Where-Object { $_ })
  if ($names -contains 'Convert with Filerrrr' -or $names -contains 'Show more options') { break }
  Start-Sleep -Milliseconds 500
}
"menu: " + ($names -join ' | ')
$ours = $items | Where-Object { $_.Current.Name -eq 'Convert with Filerrrr' } | Select-Object -First 1
if ($ours -and $Invoke) {
  $ours.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); Start-Sleep 3
  $pal = $A::RootElement.FindFirst('Children', (New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, 'Filerrrr palette')))
  if ($pal -and -not $pal.Current.IsOffscreen) { "PASS: clicking it opened the palette" } else { "FAIL: the palette did not open"; exit 1 }
  [M]::keybd_event(0x1B, 0, 0, [IntPtr]::Zero); [M]::keybd_event(0x1B, 0, 2, [IntPtr]::Zero)
}
elseif ($ours) { [M]::keybd_event(0x1B, 0, 0, [IntPtr]::Zero); [M]::keybd_event(0x1B, 0, 2, [IntPtr]::Zero) }
else { [M]::keybd_event(0x1B, 0, 0, [IntPtr]::Zero); [M]::keybd_event(0x1B, 0, 2, [IntPtr]::Zero) }
Start-Sleep 1
(New-Object -ComObject Shell.Application).Windows() | Where-Object { $_.LocationName -eq 'filerrrr-menu-test' } | ForEach-Object { $_.Quit() }
if ($ours) { "PASS: Convert with Filerrrr is in the main menu" } else { "FAIL: not in the main menu"; exit 1 }
