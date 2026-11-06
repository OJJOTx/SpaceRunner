# Moon Salvage — Orbit of Chaos

A full-screen multiplayer scavenging game for your own Node.js host. There is **no player limit by default**. Three players was the original performance target, not a gameplay restriction. Set `MAX_PLAYERS` only if you want a host-enforced capacity.

## Start and share

Requires Node.js 22+.

```sh
npm ci
npm start
```

Open http://localhost:3000. Each browser tab is a separate player. For LAN play, use the host's LAN IP and port 3000. For your cloudflared tunnel, run in a second terminal:

```sh
cloudflared tunnel --url http://localhost:3000
```

Share its HTTPS URL; WebSockets automatically use WSS. Use that public URL yourself when copying invites, since a localhost invite points to each recipient's own computer. Quick tunnels use temporary addresses; [Cloudflare's setup instructions](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) explain the service. No public tunnel is automatically created.

The server caches assets at startup. Restart it after editing client files, then reload each browser.

## What's new

- The arena occupies the entire window. A camera follows your pilot with room near map edges so the HUD does not hide you.
- Roblox-style chat opens by default with a translucent background (48% opacity, increasing to 72% while typing), speech bubbles, quick reactions, an unread indicator, and a collapsible leaderboard.
- Large thumb joystick, independent pulse and dash buttons, cooldown displays, safe-area-aware controls, and portrait/landscape layouts.
- A 2400 × 1800 world, minimap, and an accurate player-relative bank arrow when carrying cargo. It points in a straight line to the nearest active bank or open vault, tracks camera motion every frame, and shows target ID, distance, and relocation countdown. It is a bearing, not obstacle-avoiding route guidance.
- Four shared banks start at randomized, obstacle-free locations distributed across the map. They relocate on staggered schedules (first moves at 45/56/67/78 seconds, then every 60 seconds), with eight-second warnings. A bank postpones its move while a pilot is within 115 world units.
- Mint crystals give 1 cargo; gold crystals give 3. Capacity is 12.
- Banking a full bag earns +4 bonus points. Heavy cargo slows you down.
- Pulse blasts knock up to four cargo loose from nearby unshielded players and burst supply crates.
- Crates scatter crystals and restock after 14 seconds.
- Dash bursts let you escape rivals and meteor strikes.
- Magnet, shield, and boost pickups last 8.5 seconds and respawn after 21 seconds.
- The central Midnight Vault opens for 12 seconds in each 35-second cycle. It doubles your deposit, including the full-bag bonus: a full bag pays 32 points.
- Meteor showers warn with red circles 2.4 seconds ahead. Impacts drop up to four cargo and briefly stun unshielded pilots, then scatter valuable crystals.
- Six hostile NPCs patrol the moon. Scrappers have two armor points and steal two cargo per successful attack; bruisers have three armor points and drop up to three cargo with a brief stun. Their 850 ms attack warnings can be dodged, shielded, or interrupted with pulse. Pulse deals one armor damage and stuns/knocks them back. Defeating one releases stolen cargo plus three bonus crystals; it respawns after 18 seconds. Bank rings protect players from NPC attacks.
- Three-minute rounds end with standings, banked-haul counts, and cargo knocked loose; rematches start automatically.

## Controls

| Action | Desktop | Mobile / narrow window |
| --- | --- | --- |
| Move | WASD or arrows | Left thumb joystick |
| Pulse | Space | PULSE button |
| Dash | Shift | DASH button |
| Chat | Enter to open/focus; Enter to send | Top-left chat button, then message field |
| Close overlays | Escape | Close / toggle buttons |
| Instructions | ? button | ? button |
| Rankings | Top-right list button | Top-right list button |

Dashes follow your movement direction; with no movement, the last direction is used (up initially). Pulse range is 175 world units, recharge 4 seconds. Dash lasts 260 ms and recharges in 3.2 seconds. Player bodies pass through one another to avoid latency-sensitive collision jitter. Pulse blasts work through rocks. Shields protect from pulses and meteors. Newly spawned players receive 2.5 seconds of protection.

The joystick uses pointer capture, ignores extra joystick fingers, resets on cancel/lost focus, and supports a second thumb pressing abilities. Focusing chat stops movement. Desktop sound/fullscreen controls are available in the top bar; sound starts muted.

## Hosting, networking, and limits

- One Node process and one dependency (`ws`); no framework, database, image downloads, external fonts, or build tools.
- 30 Hz server simulation, 15 Hz player snapshots, and up to 20 Hz client movement messages.
- Shared collision code, immediate local movement and dash prediction, bounded RTT-based projection, authoritative correction, and remote-player interpolation.
- World-object updates are sent only when their revision changes, separately from player snapshots. Broadcast JSON is serialized once and reused for clients.
- Bounded crystal/effect/particle/chat collections; browser culls offscreen objects and caps canvas pixel ratio at 2.
- WebSocket compression disabled, 1 KB incoming payload maximum, message/chat rate limits, join timeouts, heartbeat cleanup, stale-input stop, and outgoing backpressure checks.
- Up to 32 *unjoined handshakes* may be pending. This is not a connected-player cap.
- `npm start` caps V8 old-space at 128 MB. This is not a hard limit on total process RAM.
- No account or persistent-score system. Disconnecting drops cargo; reconnecting creates a new pilot and score.
- Players share one room. There is no authentication; intended for your invited group. Scaling is finite even with no configured cap.

Environment settings:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP and WebSocket port |
| `MAX_PLAYERS` | `0` | 0 = no configured cap; positive integer = optional capacity |
| `ROUND_MS` | `180000` | Round duration |
| `BREAK_MS` | `10000` | Results intermission |

PowerShell example for an optional capacity: `$env:MAX_PLAYERS='24'; npm start`.
GET `/health` reports player count, configured cap (`null` for none), and Node RSS.

## Verification

```sh
npm test
```

Thirteen tests cover collision/diagonal movement, dash collision, 20-pilot spawn allocation, shared banking, vault timing and multipliers, pulse/shield/cooldown behavior, crate restocking, temporary powers, gold-capacity overflow, meteor damage, round resets, invalid input handling, optional host limits, randomized bank clearance and relocation grace, camera-offset navigation alignment, NPC theft/armor/death/loot/respawn, attack dodging, and bank/shield protection.

The integration test connected **12 real WebSocket clients**, with **125 ms delay each way** for one client, and exercised movement, chat, abilities, round restart, and disconnect cleanup. It measured approximately **55 MB Node RSS** and **4.1 MB total server-to-client payload over about nine seconds** across all 12 clients. This is a short local test, not a sustained capacity guarantee. Cloudflared, the operating system, and local browsers use additional memory; their RAM was not included. Real tunnel performance needs testing on your equipment.

Browser checks cover joining, pulse/dash cooldowns, popup and overlay chat, leaderboard, joystick dragging, and viewport fit at 390 × 844 portrait and 844 × 390 landscape. These are browser viewport checks, not a physical-phone/soft-keyboard test. Real network latency cannot be eliminated: movement is predicted locally, while contested actions still resolve at the server.

## Source

- `world.mjs`: authoritative game rules and world lifecycle.
- `server.mjs`: HTTP, WebSockets, input validation, broadcast pacing.
- `public/physics.js`: shared movement, collisions, map definitions.
- `public/navigation.js`: camera-aware, player-relative bank bearing.
- `public/game.js`: camera, canvas rendering, prediction, effects, controls, overlays.
- `public/index.html`, `public/style.css`: full-screen HUD and responsive layouts.
- `test/game.test.mjs`: gameplay and multi-client integration tests.


Latest browser verification: chat was open immediately after joining, background transparency was visible, cargo collection displayed the correct nearest-bank arrow, and pulsing an NPC reduced its visible armor. No browser errors were observed.
