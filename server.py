"""MoBites local server: serves the website AND writes to the Notepad (.txt) database.

Run:   python server.py        then open http://127.0.0.1:5173
Stop:  Ctrl + C

Without this server (e.g. on GitHub Pages) the site still READS the .txt files,
but new sign-ups/orders are kept in the browser instead of being written to disk.
"""
import json
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
PORT = 5173
WRITABLE = {"orders", "users"}  # tables the website may write to
LOCK = threading.Lock()         # one write at a time (a .txt file has no locking of its own)


def clean(value):
    """Keep a value from breaking the file: no | separators, no line breaks."""
    return str(value).replace("|", "/").replace("\r", " ").replace("\n", " ").strip()


def table_path(name):
    if name not in WRITABLE:
        raise ValueError("table not writable")
    return os.path.join(DATA, name + ".txt")


def read_lines(path):
    with open(path, encoding="utf-8-sig") as f:
        return f.read().splitlines()


def header_of(lines):
    return next(l for l in lines if l.strip() and not l.startswith("#")).split("|")


def append_row(name, row):
    path = table_path(name)
    with LOCK:
        header = header_of(read_lines(path))
        line = "|".join(clean(row.get(col, "")) for col in header)
        with open(path, "rb+") as f:  # make sure the last line ends before we add ours
            f.seek(0, os.SEEK_END)
            if f.tell():
                f.seek(-1, os.SEEK_END)
                if f.read(1) != b"\n":
                    f.write(b"\r\n")
        with open(path, "a", encoding="utf-8", newline="\r\n") as f:
            f.write(line + "\n")
            f.flush()
            os.fsync(f.fileno())


def update_row(name, row_id, changes):
    """Rewrite the file safely: write a temp copy, then swap it in (no half-written file)."""
    path = table_path(name)
    with LOCK:
        lines = read_lines(path)
        header = header_of(lines)
        found = False
        out = []
        for line in lines:
            cells = line.split("|")
            if line and not line.startswith("#") and cells[0] == row_id and len(cells) == len(header):
                for col, val in changes.items():
                    if col in header and col != header[0]:
                        cells[header.index(col)] = clean(val)
                line = "|".join(cells)
                found = True
            out.append(line)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8", newline="\r\n") as f:
            f.write("\n".join(out) + "\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
        return found


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        if self.path.split("?")[0].endswith(".txt"):  # always serve the latest Notepad edits
            self.send_header("Cache-Control", "no-store")
        else:                                         # re-check pages/styles so edits show on refresh
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/ping":
            return self.send_json(200, {"ok": True, "writable": sorted(WRITABLE)})
        return super().do_GET()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > 20000:
                return self.send_json(413, {"error": "too large"})
            body = json.loads(self.rfile.read(length) or b"{}")
            if self.path == "/api/append":
                append_row(body["table"], body["row"])
                return self.send_json(200, {"ok": True})
            if self.path == "/api/update":
                ok = update_row(body["table"], str(body["id"]), body["changes"])
                return self.send_json(200 if ok else 404, {"ok": ok})
            return self.send_json(404, {"error": "unknown endpoint"})
        except (ValueError, KeyError, StopIteration) as e:
            return self.send_json(400, {"error": str(e)})


if __name__ == "__main__":
    print(f"MoBites running at http://127.0.0.1:{PORT}  (Ctrl+C to stop)")
    print(f"Database folder: {DATA}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
