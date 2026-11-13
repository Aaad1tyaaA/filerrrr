; Filerrrr installer additions.
; 1. A "Choose conversion engines" page after the folder page (fresh installs only). The choice is written to
;    %APPDATA%\Filerrrr\engine-choice.json; Filerrrr downloads those engines from their official sources when it starts.
; 2. On a real uninstall, everything Filerrrr added to Windows and its downloaded engines are removed. An update runs the
;    old uninstaller too (${isUpdated} is set then): keep everything, the new version reuses it.
!include nsDialogs.nsh
!include LogicLib.nsh

!macro customPageAfterChangeDir
  !include "${BUILD_RESOURCES_DIR}\engine-sizes.nsh"
  Var EngMedia
  Var EngRender
  Var EngOcr
  Var EngTotal
  Page custom EnginesPageCreate EnginesPageLeave

  Function EnginesPageCreate
    ${if} ${isUpdated}
      Abort ; an update keeps the engines already installed
    ${endIf}
    !insertmacro MUI_HEADER_TEXT "Choose conversion engines" "Add only what you need. You can change this any time in Settings > Engines."
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 20u "Images, documents, spreadsheets, PDFs, data, archives and fonts already convert. Pick the extra engines you want:"
    Pop $0

    ${NSD_CreateCheckbox} 0 26u 100% 12u "Video && audio  (${ENGINE_MEDIA_MB} MB)"
    Pop $EngMedia
    ${NSD_Check} $EngMedia
    ${NSD_OnClick} $EngMedia EnginesClicked
    ${NSD_CreateLabel} 13u 38u 95% 10u "Convert, compress and trim video and audio. Uses FFmpeg."
    Pop $0

    ${NSD_CreateCheckbox} 0 54u 100% 12u "PDF pages && Photoshop  (${ENGINE_RENDER_MB} MB)"
    Pop $EngRender
    ${NSD_Check} $EngRender
    ${NSD_OnClick} $EngRender EnginesClicked
    ${NSD_CreateLabel} 13u 66u 95% 10u "Turn PDF pages into JPG or PNG and open PSD files."
    Pop $0

    ${NSD_CreateCheckbox} 0 82u 100% 12u "Scanned text recognition  (${ENGINE_OCR_MB} MB)"
    Pop $EngOcr
    ${NSD_OnClick} $EngOcr EnginesClicked
    ${NSD_CreateLabel} 13u 94u 95% 10u "Read English text from scans and photos of documents (OCR)."
    Pop $0

    ${NSD_CreateLabel} 0 110u 100% 10u ""
    Pop $EngTotal
    ${NSD_CreateLabel} 0 122u 100% 18u "They download from their official sources when Filerrrr first starts, in the background, and are checked before use."
    Pop $0
    Call EnginesUpdateTotal
    nsDialogs::Show
  FunctionEnd

  Function EnginesClicked
    Pop $0 ; the clicked checkbox
    Call EnginesUpdateTotal
  FunctionEnd

  Function EnginesUpdateTotal
    StrCpy $1 0
    ${NSD_GetState} $EngMedia $0
    ${if} $0 == ${BST_CHECKED}
      IntOp $1 $1 + ${ENGINE_MEDIA_MB}
    ${endIf}
    ${NSD_GetState} $EngRender $0
    ${if} $0 == ${BST_CHECKED}
      IntOp $1 $1 + ${ENGINE_RENDER_MB}
    ${endIf}
    ${NSD_GetState} $EngOcr $0
    ${if} $0 == ${BST_CHECKED}
      IntOp $1 $1 + ${ENGINE_OCR_MB}
    ${endIf}
    ${if} $1 == 0
      ${NSD_SetText} $EngTotal "Nothing selected. You can add engines later in Settings."
    ${else}
      ${NSD_SetText} $EngTotal "Download: $1 MB"
    ${endIf}
  FunctionEnd

  Function EnginesPageLeave
    StrCpy $2 ""
    ${NSD_GetState} $EngMedia $0
    ${if} $0 == ${BST_CHECKED}
      StrCpy $2 '$2,"media"'
    ${endIf}
    ${NSD_GetState} $EngRender $0
    ${if} $0 == ${BST_CHECKED}
      StrCpy $2 '$2,"render"'
    ${endIf}
    ${NSD_GetState} $EngOcr $0
    ${if} $0 == ${BST_CHECKED}
      StrCpy $2 '$2,"ocr"'
    ${endIf}
    StrCpy $2 $2 "" 1 ; drop the leading comma
    ; Filerrrr reads this from the user's own profile, also when it is installed for all users
    SetShellVarContext current
    CreateDirectory "$APPDATA\Filerrrr"
    FileOpen $3 "$APPDATA\Filerrrr\engine-choice.json" w
    FileWrite $3 '{"install":[$2]}'
    FileClose $3
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endIf}
  FunctionEnd
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegKey HKCU "Software\Classes\*\shell\Filerrrr"
    Delete "$APPDATA\Microsoft\Windows\SendTo\Filerrrr.lnk"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Filerrrr"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.filerrrr.app"
    ; the Windows 11 menu package (added from Settings) goes too
    nsExec::Exec 'powershell -NoProfile -NonInteractive -Command "Get-AppxPackage -Name Filerrrr.ExplorerMenu | Remove-AppxPackage"'
    ; downloaded engines (settings and history stay, as with any app); they live in the user's own profile
    SetShellVarContext current
    RMDir /r "$APPDATA\Filerrrr\engines"
    Delete "$APPDATA\Filerrrr\engine-choice.json"
    Delete "$APPDATA\Microsoft\Windows\SendTo\Filerrrr.lnk"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endIf}
  ${endIf}
!macroend
