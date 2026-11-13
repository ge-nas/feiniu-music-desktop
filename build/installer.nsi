Unicode true
SetCompressor /SOLID lzma

!include "MUI2.nsh"

!define APPNAME "飞牛音乐"
!define APPVER "0.1.0"
!define APPEXE "FnMusic.exe"
!define REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\FnMusic"

Name "${APPNAME} ${APPVER}"
OutFile "../dist/fnmusic-setup-${APPVER}.exe"
InstallDir "$LOCALAPPDATA\Programs\FnMusic"
InstallDirRegKey HKCU "Software\fnmusic\player" "InstallDir"
RequestExecutionLevel user
BrandingText "${APPNAME} ${APPVER}"
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "0.1.0.0"
VIAddVersionKey /LANG=2052 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=2052 "ProductVersion" "${APPVER}"
VIAddVersionKey /LANG=2052 "FileDescription" "${APPNAME} 安装程序"
VIAddVersionKey /LANG=2052 "FileVersion" "${APPVER}"
VIAddVersionKey /LANG=2052 "CompanyName" "fnmusic"
VIAddVersionKey /LANG=2052 "LegalCopyright" "Personal use only"

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APPEXE}"
!define MUI_FINISHPAGE_RUN_TEXT "立即启动 ${APPNAME}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

Section "安装 ${APPNAME}" SEC_MAIN
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "../dist/fnmusic-win32-x64/*.*"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${APPEXE}"
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${APPEXE}"

  WriteRegStr HKCU "${REGKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${REGKEY}" "DisplayVersion" "${APPVER}"
  WriteRegStr HKCU "${REGKEY}" "Publisher" "fnmusic"
  WriteRegStr HKCU "${REGKEY}" "DisplayIcon" "$INSTDIR\${APPEXE}"
  WriteRegStr HKCU "${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${REGKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REGKEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${REGKEY}" "EstimatedSize" 276480
  WriteRegStr HKCU "Software\fnmusic\player" "InstallDir" "$INSTDIR"
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk"
  RMDir "$SMPROGRAMS\${APPNAME}"

  DeleteRegKey HKCU "${REGKEY}"
  DeleteRegKey HKCU "Software\fnmusic"

  RMDir /r "$INSTDIR"
SectionEnd
