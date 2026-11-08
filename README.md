# Mintfall

A real-time 4v4 MOBA for phones, in a single HTML page. Every champion, minion and tower is a minted coin.

Open `dist/index.html` to play against bots.

## What's here

- `src/sim.js`: the whole game (map, champions, minions, towers, bots). It has no browser code, so the same file can run in a Cloudflare Durable Object when online play is added.
- `src/art.js`: coin, terrain and tree art, all drawn in code.
- `src/game.js`: rendering, weather and light, touch controls, HUD and lobby.
- `src/template.html`: page shell and styles.
- `build.py`: inlines everything into `dist/index.html`.

## Commands

```
python3 build.py          # rebuild dist/index.html
node test_sim.js 24 hard  # run bot-vs-bot matches and print pacing and win rates
python3 test_ui.py        # drive the page with touch in phone-sized Chrome (needs Playwright)
```

## Online play (next)

Each invite code maps to one Durable Object running `Sim.step` at a fixed tick. Phones send the same commands the local client already pushes to `c.q`, and receive state back. Bots keep filling empty seats.
