#!/usr/bin/env python3
"""Inline the source files into one HTML page at dist/index.html."""
from pathlib import Path
root = Path(__file__).parent
src = root / 'src'
page = (src / 'template.html').read_text()
for tag, name in (('/*SIM*/', 'sim.js'), ('/*ART*/', 'art.js'), ('/*GAME*/', 'game.js')):
    page = page.replace(tag, (src / name).read_text())
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'index.html').write_text(page)
print(len(page), 'bytes')
