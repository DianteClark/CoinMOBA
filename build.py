#!/usr/bin/env python3
"""Inline the source files into one HTML page at dist/index.html."""
from pathlib import Path
root = Path(__file__).parent
src = root / 'src'
# src/sim.js is generated: game rules plus bot brains, one closure. Edit src/sim/*.js.
(src / 'sim.js').write_text((src / 'sim' / 'game.js').read_text().replace('/*CONTENT*/', (src / 'sim' / 'content.js').read_text()).replace('/*BOTS*/', (src / 'sim' / 'bots.js').read_text()).replace('/*CODEC*/', (src / 'sim' / 'codec.js').read_text()))
page = (src / 'template.html').read_text()
client = '\n'.join((src / 'client' / n).read_text() for n in ('core.js', 'world.js', 'fx.js', 'controls.js', 'net.js', 'hud.js', 'menus.js', 'soundhooks.js', 'zz_boot.js'))
parts = {
    '/*PEER*/': (src / 'vendor' / 'peerjs.min.js').read_text().replace('</script', '<\\/script'),
    '/*SIM*/': (src / 'sim.js').read_text(),
    '/*ART*/': (src / 'art.js').read_text() + '\n' + (src / 'terrain.js').read_text(),
    '/*AUDIO*/': (src / 'audio.js').read_text(),
    '/*CLIENT*/': '(() => {\n' + client + '\n})();',
}
for tag, code in parts.items():
    page = page.replace(tag, code)
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'index.html').write_text(page)
# PWA: the manifest and generated icons sit beside the page.
for f in (src / 'pwa').iterdir():
    (root / 'dist' / f.name).write_bytes(f.read_bytes())
print(len(page), 'bytes')
