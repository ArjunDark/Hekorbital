#!/usr/bin/env python3
"""
build_preview.py — bundle the whole project into one standalone HTML file.

    python3 build_preview.py            # → sat-img-pipe-preview.html

Everything is inlined: the stylesheet, every script, the coastline data and all
18 dataset tiles as base64 data URLs. The result opens by double-click — no
server needed, because data URLs do not taint the canvas the way file:// images
do, so preprocessing can still read pixels.

The multi-file tree stays the source of truth; this is a build artifact.
"""

import base64
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'sat-img-pipe-preview.html')

# load order mirrors index.html
SCRIPTS = [
    'js/config.js',
    'dataset/manifest.js',
    'js/earth-data.js',
    'preprocess/index.js',
    'model/index.js',
    'model/stub-featurescore.js',
    'js/log.js',
    'js/earth.js',
    'js/stage.js',
    'js/storage.js',
    'js/ui.js',
    'js/app.js',
]


def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as fh:
        return fh.read()


def tiles_with_data():
    """Rewrite the manifest so every tile carries its bytes inline."""
    manifest = read('dataset/manifest.js')
    for m in re.finditer(r"file:\s*'([^']+)'", manifest):
        rel = m.group(1)
        path = os.path.join(ROOT, 'dataset', rel)
        if not os.path.exists(path):
            sys.exit('missing tile: %s' % path)
        with open(path, 'rb') as fh:
            b64 = base64.b64encode(fh.read()).decode('ascii')
        manifest = manifest.replace(
            "file: '%s'" % rel,
            "file: '%s', data: 'data:image/jpeg;base64,%s'" % (rel, b64))
    return manifest


def build():
    html = read('index.html')

    # inline the stylesheet
    html = re.sub(
        r'<link rel="stylesheet" href="css/styles\.css">',
        '<style>\n' + read('css/styles.css') + '\n</style>',
        html, count=1)

    # inline the scripts, replacing the external tags in order
    for rel in SCRIPTS:
        src = tiles_with_data() if rel == 'dataset/manifest.js' else read(rel)
        tag = '<script src="%s"></script>' % rel
        if tag not in html:
            sys.exit('script tag not found: %s' % tag)
        html = html.replace(tag, '<script>\n' + src + '\n</script>', 1)

    # any script tag left over is an ordering bug
    leftovers = re.findall(r'<script src="[^"]+"></script>', html)
    if leftovers:
        sys.exit('uninlined scripts: %s' % leftovers)

    html = html.replace(
        '<title>SAT-1 // imager payload terminal</title>',
        '<title>SAT-1 // imager payload terminal (standalone)</title>')

    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(html)

    print('%s  %.1f MB' % (os.path.basename(OUT), os.path.getsize(OUT) / 1048576))


if __name__ == '__main__':
    build()
