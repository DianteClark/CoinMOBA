# Flipside: Heroes vs Villains

A real-time 4v4 superhero MOBA for phones, in a single HTML page. Each match you are randomly a Hero or a Villain, saving the people or terrorizing the city, and everything on the map is a minted coin.

**[Play it live](https://dianteclark.github.io/CoinMOBA/)** on your phone, against bots.

## What's here

- `src/sim.js`: the whole game (map, champions, roles, bots, the people). It has no browser code, so the same file can run in a Cloudflare Durable Object when online play is added.
- `src/art.js`, `src/terrain.js`: coins, portraits, town and terrain, all drawn in code.
- `src/audio.js`: generated music and sound, no audio files.
- `src/client/`: rendering, effects, touch controls, HUD and menus, concatenated into one script.
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
