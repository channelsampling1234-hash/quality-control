@echo off
title Server Localhost P5M & Checklist Tools
echo ========================================================
echo   Menjalankan Server Localhost (Python HTTP Server)
echo   PORT: 9000
echo ========================================================
echo.
echo Menghidupkan server di port 9000...
start "" python -m http.server 9000
echo.
echo Menunggu server siap...
timeout /t 2 /nobreak > nul
echo Membuka browser di http://localhost:9000/Index.html ...
start "" http://localhost:9000/Index.html
echo.
echo Server berjalan. Tutup jendela ini untuk mematikan server.
echo (Tekan tombol apa saja untuk menutup)
pause > nul
