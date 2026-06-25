@echo off
color 0A
echo ===================================================
echo   CONFIGURAR PRINTBRIDGE PARA INICIO AUTOMATICO
echo ===================================================
echo.
echo Este script hara que PrintBridge se inicie solo cada vez que enciendas tu computadora.
echo.
pause

set SCRIPT="%TEMP%\%RANDOM%-%RANDOM%-%RANDOM%-%RANDOM%.vbs"
echo Set oWS = WScript.CreateObject("WScript.Shell") >> %SCRIPT%
echo sLinkFile = "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PrintBridge.lnk" >> %SCRIPT%
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> %SCRIPT%
echo oLink.TargetPath = "%~dp0PrintBridge.exe" >> %SCRIPT%
echo oLink.WorkingDirectory = "%~dp0" >> %SCRIPT%
echo oLink.Description = "Servidor de Impresion PrintBridge" >> %SCRIPT%
echo oLink.Save >> %SCRIPT%

cscript /nologo %SCRIPT%
del %SCRIPT%

echo.
echo ===================================================
echo ¡LISTO! Configuracion completada con exito.
echo PrintBridge ahora se abrira automaticamente al encender esta PC.
echo ===================================================
echo.
pause
