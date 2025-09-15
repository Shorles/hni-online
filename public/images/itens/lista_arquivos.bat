@echo off
powershell -command "Get-ChildItem -Name 'D:\Github\hni-online\public\images\itens' | Out-File -FilePath 'lista.txt' -Encoding utf8"
