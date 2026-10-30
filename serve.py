#!/usr/bin/env python3
"""
serve.py — tiny static server for SAT-IMG-PIPE.

The simulator reads canvas pixels during preprocessing. Browsers taint a
canvas when the image came from the filesystem, so opening index.html with
file:// will not work. Serve it over HTTP:

    python3 serve.py            # http://localhost:8000
    python3 serve.py 9000       # a different port
"""

import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # never cache during development
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print("SAT-IMG-PIPE  →  http://localhost:%d" % PORT)
        print("serving %s" % ROOT)
        print("ctrl-c to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")
