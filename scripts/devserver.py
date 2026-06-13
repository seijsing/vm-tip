#!/usr/bin/env python3
# Liten lokal statisk server för utveckling/preview. Undviker os.getcwd()
# (blockeras i vissa sandlådor) genom att ange katalogen explicit.
import functools
import http.server
import socketserver

ROOT = "/Users/seijsing/Documents/Github/vm-tip"
PORT = 8000

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(socketserver.TCPServer):
    allow_reuse_address = True


with Server(("127.0.0.1", PORT), NoCacheHandler) as httpd:
    print(f"Serving {ROOT} at http://127.0.0.1:{PORT}")
    httpd.serve_forever()
