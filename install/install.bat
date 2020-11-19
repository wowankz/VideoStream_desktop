@echo off
SetLocal EnableExtensions EnableDelayedExpansion

call VideoStream.exe "install.js" "%~1"

REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\video.stream" /ve /t REG_SZ /d "%~dp0video.stream.json" /f


