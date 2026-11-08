"""One smoke run: page in phone-sized Chrome with touch, screenshots to shots/."""
import pathlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent
out = root / 'shots'; out.mkdir(exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    c = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = c.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.goto((root / 'dist' / 'index.html').as_uri()); pg.wait_for_timeout(1200)
    pg.screenshot(path=str(out / 'a_title.png'))
    pg.tap('#title'); pg.wait_for_timeout(1500)
    pg.screenshot(path=str(out / 'b_lobby.png'))
    pg.tap('#start'); pg.wait_for_timeout(1800)
    pg.screenshot(path=str(out / 'c_intro.png'))
    pg.wait_for_timeout(3000)
    pg.evaluate("()=>{const G=__mintfall.G;G.me.lvl=4;const t=G.s.towers.find(t=>t.team===G.me.team&&t.tier===0&&t.lane===0);G.me.x=G.me.px=t.x+(G.me.team?-120:120);G.me.y=G.me.py=t.y-20;G.cam.x=G.me.x;G.cam.y=G.me.y;}")
    pg.wait_for_timeout(16000)
    pg.screenshot(path=str(out / 'd_lane.png'))
    u = pg.evaluate("__mintfall.G.s.t")
    cd = c.new_cdp_session(pg)
    pos = pg.evaluate("(()=>{return {w:innerWidth,h:innerHeight}})()")
    ax, ay = pos['w'] - 92 - 104, pos['h'] - 80 + 18
    cd.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': ax, 'y': ay, 'id': 2}]})
    pg.wait_for_timeout(60)
    for dx in range(0, 90, 15):
        cd.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': ax - dx, 'y': ay - dx * .3, 'id': 2}]}); pg.wait_for_timeout(30)
    pg.wait_for_timeout(400)
    pg.screenshot(path=str(out / 'e_aim.png'))
    aiming = pg.evaluate("(()=>{const G=__mintfall.G;return [G.me.champ, G.me.role, G.me.team]})()")
    cd.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(200)
    print('t', u, 'me', aiming, 'cd', pg.evaluate("__mintfall.G.me.cd"), 'fps q', pg.evaluate("(()=>__mintfall.G.frames)()"))
    pg.evaluate("()=>{const G=__mintfall.G;G.s.hope=12;G.s.t=480;G.s.nextWave=G.s.t+5;}")
    pg.wait_for_timeout(4000)
    pg.screenshot(path=str(out / 'f_lowhope.png'))
    print('errors', errs[:8])
    b.close()
