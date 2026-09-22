#!/usr/bin/env python3
"""
📱 CyberSarah APK Download Server
Starte:  python3 serve-apk.py
Dann öffne im Browser: http://DEINE_HANDY_IP:8765

Oder von einem anderen Gerät im selben Netzwerk:
http://$(hostname -I | awk '{print $1}'):8765
"""
import http.server
import socketserver
import os

PORT = 8765
DIR = os.path.dirname(os.path.abspath(__file__))

class ApkHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)
    
    def do_GET(self):
        if self.path == "/":
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(f"""
            <!DOCTYPE html>
            <html>
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>CyberSarah APK Download</title>
            <style>
                *{{margin:0;padding:0;box-sizing:border-box}}
                body{{font-family:-apple-system,sans-serif;background:#0a0a0f;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh}}
                .card{{background:#111118;border:1px solid #2a1a4e;border-radius:16px;padding:2rem;max-width:400px;width:90%;text-align:center}}
                h1{{background:linear-gradient(90deg,#a855f7,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:1.5rem;margin-bottom:0.5rem}}
                p{{color:#9ca3af;margin:0.5rem 0 1.5rem;font-size:0.9rem}}
                .apk-btn{{display:block;background:linear-gradient(90deg,#a855f7,#06b6d4);color:#fff;padding:1rem;border-radius:12px;text-decoration:none;font-weight:600;font-size:1.1rem;margin:0.5rem 0;transition:opacity .2s}}
                .apk-btn:hover{{opacity:0.9}}
                .info{{color:#6b7280;font-size:0.8rem;margin-top:1rem;border-top:1px solid #1f1f2e;padding-top:1rem}}
                .version{{color:#a855f7;font-weight:600}}
            </style>
            </head>
            <body>
            <div class="card">
                <h1>🚀 CyberSarah</h1>
                <p>KI-gestütztes Revenue Operating System</p>
                <a class="apk-btn" href="/CyberSarah-Master-v7.0-release.apk" download>📱 APK v7.0 herunterladen</a>
                <a class="apk-btn" href="/CyberSarah-Master-v4.0-release.apk" download style="background:linear-gradient(90deg,#374151,#4b5563);font-size:0.9rem">📱 APK v6.3 (ältere Version)</a>
                <div class="info">
                    <span class="version">Version 5.0.0</span> • Build 15<br>
                    Signiert & releasefertig<br><br>
                    <span style="color:#6b7280">📋 Nach Download: Datei über Dateimanager öffnen und installieren</span>
                </div>
            </div>
            </body>
            </html>
            """.encode())
        else:
            super().do_GET()

if __name__ == "__main__":
    apks = [f for f in os.listdir(DIR) if f.endswith(".apk")]
    print(f"\n  📱 CyberSarah APK Server")
    print(f"  {'='*40}")
    print(f"  Verfügbare APKs:")
    for a in apks:
        size_mb = os.path.getsize(os.path.join(DIR, a)) / (1024*1024)
        print(f"    📦 {a} ({size_mb:.1f} MB)")
    print(f"\n  🌐 Server läuft auf http://0.0.0.0:{PORT}")
    print(f"  📱 Vom Handy: http://$(hostname -I | awk '{{print $1}}'):{PORT}")
    print(f"  {'='*40}\n")
    
    with socketserver.TCPServer(("0.0.0.0", PORT), ApkHandler) as httpd:
        httpd.serve_forever()
