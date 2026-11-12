; Removes what Filerrrr adds to Windows for the current user, on a real uninstall only.
; An update runs the old uninstaller too (${isUpdated} is set then): keep everything, the new version reuses it.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegKey HKCU "Software\Classes\*\shell\Filerrrr"
    Delete "$APPDATA\Microsoft\Windows\SendTo\Filerrrr.lnk"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Filerrrr"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.filerrrr.app"
    ; the Windows 11 menu package (added from Settings) goes too
    nsExec::Exec 'powershell -NoProfile -NonInteractive -Command "Get-AppxPackage -Name Filerrrr.ExplorerMenu | Remove-AppxPackage"'
  ${endIf}
!macroend
