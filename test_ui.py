"""Drive the built page in phone-sized Chrome with touch, and take screenshots."""
import sys, time, pathlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent
out = root / 'shots'; out.mkdir(exist_ok=True)
url = (root / 'dist' / 'index.html').as_uri()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'fonts' not in m.text and 'ERR_' not in m.text else None)
    pg.goto(url); pg.wait_for_timeout(900)
    pg.screenshot(path=str(out / '1_lobby.png'))
    pg.tap('#start'); pg.wait_for_timeout(1500)
    pg.screenshot(path=str(out / '2_start.png'))
    # teleport near the action and let the wave arrive, with the bots playing around the human
    pg.evaluate("""() => { const G=__mintfall.G; const s=G.s; const me=G.me; me.lvl=4; me.x=me.px=1000; me.y=me.py=300; me.gold=900;
      for (let i=0;i<1000;i++){ window.Sim && 0; } }""")
    pg.wait_for_timeout(16000)
    pg.screenshot(path=str(out / '3_lane.png'))
    # Aim an ability with a real drag via CDP touch
    cdp = ctx.new_cdp_session(pg)
    ui = pg.evaluate("__mintfall.UI()")
    a = ui['ab'][0]
    def touch(kind, pts): cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': pts})
    stick = {'x': 130, 'y': 300, 'id': 1}
    touch('touchStart', [stick]); pg.wait_for_timeout(60)
    touch('touchMove', [{'x': 180, 'y': 300, 'id': 1}]); pg.wait_for_timeout(500)
    moved = pg.evaluate("[__mintfall.G.me.mv.x, __mintfall.G.me.mv.y]")
    ab = {'x': a['x'], 'y': a['y'], 'id': 2}
    touch('touchMove', [{'x': 180, 'y': 300, 'id': 1}, ab]) if False else None
    touch('touchStart', [{'x': 180, 'y': 300, 'id': 1}, ab]); pg.wait_for_timeout(80)
    for dx in range(0, 90, 15):
        touch('touchMove', [{'x': 180, 'y': 300, 'id': 1}, {'x': a['x'] - dx, 'y': a['y'] - dx * .3, 'id': 2}]); pg.wait_for_timeout(30)
    pg.wait_for_timeout(900)
    pg.screenshot(path=str(out / '4_aim.png'))
    charge = pg.evaluate("__mintfall.G.me.charge && __mintfall.G.me.charge.t")
    touch('touchEnd', []); pg.wait_for_timeout(200)
    cd = pg.evaluate("__mintfall.G.me.cd[0]")
    print('stick mv', moved, 'charge t', charge, 'cooldown after release', cd)
    # Night and rain
    pg.evaluate("""() => { const G=__mintfall.G; G.s.t=560; G.rainNext=0; }""")
    pg.wait_for_timeout(5000)
    pg.screenshot(path=str(out / '5_night.png'))
    # forge
    pg.tap('canvas#view', position={'x': ui['forge']['x'] + 40, 'y': ui['forge']['y'] + 15}); pg.wait_for_timeout(300)
    pg.screenshot(path=str(out / '6_forge.png'))
    fp = pg.evaluate("__mintfall.G.frames")
    print('frames', fp, 'quality probe done')
    # Force the end
    pg.evaluate("""() => { const G=__mintfall.G; const core=G.s.towers.find(t=>t.sub==='core'&&t.team!==G.me.team); G.me.stats.skillHits=12; G.me.stats.casts=20; G.me.stats.kills=4; G.s.over={winner:G.me.team,t:G.s.t}; G.s.ev.length=0; }""")
    pg.wait_for_timeout(700)
    pg.screenshot(path=str(out / '8_end.png'))
    b2 = pg.evaluate("document.getElementById('end').classList.contains('hide')")
    print('end screen hidden (want False):', b2)
    print('errors:', errs[:10])
    # Portrait: the stage must rotate and touches must map correctly
    ctx2 = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg2 = ctx2.new_page(); e2 = []; pg2.on('pageerror', lambda e: e2.append(str(e)))
    pg2.goto(url); pg2.wait_for_timeout(700)
    pg2.screenshot(path=str(out / '7_portrait.png'))
    box = pg2.evaluate("(()=>{const r=document.getElementById('start').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")
    pg2.touchscreen.tap(box[0], box[1]); pg2.wait_for_timeout(800)
    started = pg2.evaluate("!!__mintfall.G")
    print('portrait started', started, e2[:5])
    b.close()
