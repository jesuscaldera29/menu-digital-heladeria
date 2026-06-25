@echo off
powershell -Command "Start-Process powershell -ArgumentList '-NoProfile -Command netsh advfirewall firewall add rule name=\"PrintBridge_Kiosko_9102\" dir=in action=allow protocol=TCP localport=9102; Write-Host \"Puerto Abierto Exitosamente. Cierra esta ventana.\"; pause' -Verb RunAs"
