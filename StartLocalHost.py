#!/usr/bin/env python3
"""
Serves the directory this script lives in over HTTP, with
Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy headers set
so the page is cross-origin isolated and SharedArrayBuffer is available.

Asks for a port via a small popup before starting.
"""

import http.server
import socketserver
import webbrowser
import os
import sys
import tkinter as tk
from tkinter import simpledialog, messagebox

# Directory this script is in — that's what gets served.
SERVE_DIR = os.path.dirname(os.path.abspath(__file__))


class IsolatedHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SERVE_DIR, **kwargs)

    def end_headers(self):
        # Required together to get a cross-origin-isolated context.
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()


def ask_for_port(default=8000):
    root = tk.Tk()
    root.withdraw()  # hide the empty main window, only show the dialog

    port = simpledialog.askinteger(
        "Local Server Port",
        "Enter the port to host the local server on:",
        initialvalue=default,
        minvalue=1,
        maxvalue=65535,
    )

    root.destroy()

    if port is None:
        print("No port entered — exiting.")
        sys.exit(0)

    return port


def main():
    port = ask_for_port()

    try:
        with socketserver.TCPServer(("", port), IsolatedHTTPRequestHandler) as httpd:
            url = f"http://localhost:{port}/"
            print(f"Serving {SERVE_DIR}")
            print(f"Cross-origin isolated at {url}")
            print("Press Ctrl+C to stop.")

            webbrowser.open(url)

            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\nShutting down.")
    except OSError as e:
        # Most common case: port already in use
        messagebox.showerror("Server Error", f"Couldn't start server on port {port}:\n{e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
