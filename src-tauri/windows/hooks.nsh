; ConPTY paste-truncation fix: the in-box conpty.dll on older Windows 10/11
; builds has a parser bug (conhost's VtInputThread reads the input pipe in a
; fixed 4KB buffer; a paste that spans that boundary gets corrupted — head
; dropped, tail survives as raw keystrokes). Fixed upstream in
; microsoft/terminal#17738 (shipped in Windows Terminal 1.21.2701.0+) and
; redistributed via the Microsoft.Windows.Console.ConPTY NuGet package.
; portable-pty sideloads conpty.dll from the application directory if present
; (src/win/psuedocon.rs::load_conpty()), so the fixed dll must live next to
; the main exe. The explicit resource map places it at the install root;
; POSTINSTALL also handles the older resources-subfolder layout.

!macro NSIS_HOOK_POSTINSTALL
  ${If} ${FileExists} "$INSTDIR\resources\conpty.dll"
    CopyFiles /SILENT "$INSTDIR\resources\conpty.dll" "$INSTDIR\conpty.dll"
    Delete "$INSTDIR\resources\conpty.dll"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\conpty.dll"
!macroend
