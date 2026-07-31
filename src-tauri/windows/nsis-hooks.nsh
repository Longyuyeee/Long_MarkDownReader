!macro LONGEDIT_REGISTER_OPENWITH EXT
  ReadRegStr $R0 SHELL_CONTEXT "Software\Classes\.${EXT}" "LongEdit.Markdown_backup"
  ${If} $R0 == ""
    DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}" ""
  ${Else}
    WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}" "" "$R0"
  ${EndIf}
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "LongEdit.Markdown" ""
!macroend

!macro LONGEDIT_REMOVE_OPENWITH EXT
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "LongEdit.Markdown"
  DeleteRegKey /ifempty SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}" "LongEdit.Markdown_backup"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro LONGEDIT_REGISTER_OPENWITH "md"
  !insertmacro LONGEDIT_REGISTER_OPENWITH "markdown"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro LONGEDIT_REMOVE_OPENWITH "md"
  !insertmacro LONGEDIT_REMOVE_OPENWITH "markdown"
!macroend
