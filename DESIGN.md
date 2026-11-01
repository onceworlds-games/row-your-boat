# Row Your Boat: design

3D rhythm racing on a moonlit dream of a river. Vite + three.js. Slug `row-your-boat`, genre Racing.

## The pitch

**Row on the beat, gently down the stream: the better your rhythm, the faster your boat.**

**The goal in one look:** your little lantern-lit boat on a night river, silver ripples rolling down the water onto your
oars in time with the song, rival boats beside you, and an arch of paper lanterns far ahead. Get there first.

Description (store): "Row on the beat down a dream of a river. Fastest boat wins."

## What the screen shows

The camera sits behind and above your boat. Your rower sits facing you (real rowers face the stern), pulling the oars
toward the camera. Ahead, moonlit **beat ripples** (silver crest lines across the water) roll down the river toward your
boat and cross the **oar line** (the arc your oar blades sweep) exactly on each beat of the song. That is the whole
lesson: when the ripple reaches your oars, tap. Four paper lanterns hang from a pole on your bow: they are your combo.
Your place is a huge numeral top right. The finish arch glows at the end of the river.

## Controls

| Input | Keyboard / mouse | Phone / tablet |
|---|---|---|
| Left oar | A, ←, J | tap the left half of the screen |
| Right oar | D, →, K | tap the right half of the screen |
| Both oars (a straight stroke) | left + right within 50 ms | two thumbs together |
| Pause (The Dream only) | Esc, P | the pause sign (top right) |
| Row it again (The Dream only) | R | the pause sign's Again |
| Menus | click, Enter, Space | tap |

- **Every beat, one stroke.** A stroke on the left oar swings the bow left; on the right, right. So alternating left,
  right, left, right rows straight (the boat wiggles gently), two in a row on one side turn that way, and both oars at
  once is a straight stroke too. You tap the side you want to go.
- The touch zones are the two halves of the screen (any finger, multi-touch). On touch screens two oar blades are drawn
  low in the left and right corners of the scene and dip when that side strokes; nothing to read sits under the thumbs.
  `ow.controls.set(null)` always: no platform stick or buttons.
- Input timing uses the event's `timeStamp` (pointerdown / keydown, never key repeat), mapped onto the song clock.

## The first 60 seconds

| Time | Screen | Hint (2-5 words, once) |
|---|---|---|
| 0 s | Title paints within ~2 s: a low camera glides over the night river; six bot boats row in time toward us, lanterns swinging, mist, the moon. "Row Your Boat" in big cream Fraunces, its reflection rippling on the water below it. One oar-blade button: **Row** (Space). | none |
| 3 s | Tap Row: the AudioContext starts, the music box plays the tune softly on the beat; the camera sweeps down onto **the Dock**: your boat in berth 1, your rower dressed from your avatar's colours, your name on a lantern tag. Empty berths show a dim "+" lantern (invite). The signpost reads "Bedtime". The platform's Ready strip is at the bottom. | none |
| 5 s | Tap Ready. Alone in a public server, the room starts the match at once (min 1 player; bots fill to six boats). | none |
| 5-9 s | **Intro (4 s):** camera swings behind your boat inside a giant moonlit bedroom; the river pours from an open wardrobe. Five rivals slide into the start line beside you, each with a name tag and a hat. The start arch's three lanterns light on the count-in beats: tock, tock, tock, and the ripples start rolling in. | "Tap when it reaches you" (an arrow from the first ripple to the oars) |
| 9 s | First beat. The player taps: a clean splash, the music box sings "Row" from your stroke, the boat lunges forward. | "Left · right · left · right" (both oar blades glow alternately) |
| 12 s | Four good strokes: the second bow lantern lights with a soft whoomp and a harp run; the boat is visibly quicker. | "Merrily ×2" painted on the lantern |
| 15-25 s | The first gentle bend: alternating, the current carries the boat round. A toy block sits ahead, lit by your bow lantern's beam. If the player drifts at it: the right oar blade glows. | "Right, right: turn right" (only if heading toward a bank or obstacle for 1 s) |
| 25 s | A mistimed tap: dull plunk, spray, the lanterns snuff out, the boat stalls. After three in a row: | "Wait for the ripple" |
| 35 s | ×4 reached: all four lanterns lit, the strings and bells join the song, the wake turns silver, the word "Merrily!" swells over the boat. The river runs under the giant bed: a short dark line or the long way round. | "Short way" with an arrow, at the first split |
| 45 s | A **breath**: the ripples stop, the water stills, fireflies, the song holds a long chord for two bars. | "Glide…" |
| 60 s+ | Out of the window into the night garden; the lantern arch ahead; the place numeral flips 3 → 2 as you pass a rival in their wake. | "Ride the wake" (first time a slipstream lights) |

The very first race of a new player (an `ow.save` flag until they finish one) is gentler: judging windows ×1.3 and the
rivals on Bedtime eased. Every hint shows once per player (save flag), and again only to a player who seems stuck
(three splashes in a row, ten seconds against a bank).

## The core loop and where mastery comes from

### The beat

- The song is in 6/8: two beats (dotted quarters) to a bar, 16 beats to a verse ("Row, row, row your boat, gently down the
  stream, merrily ×4, life is but a dream"). You stroke on every beat.
- **Judging:** each stroke is matched to the nearest beat. Within **±45 ms: perfect**; within **±110 ms: good**; further
  off: **splash**. A beat that passes +110 ms with no stroke is a **miss**. One stroke per beat: a second tap in the same
  beat's window is a splash, unless it is the other oar within 50 ms (both oars: one straight stroke).
- **Breaths:** after every three verses the song breaks down for two bars (4 beats): no ripples, nothing judged, the
  current carries you, combo kept, speed drag is a third of normal. Each breath steps the tempo up 4% (at most +12%).

### Combo: "merrily"

- The four bow lanterns. A streak of on-beat strokes (good or perfect) lights one more lantern every 4 strokes:
  **×1** (one lit) → **×2** after 4 → **×3** after 8 → **×4** after 12.
- **Miss:** down one lantern. **Splash:** all but the first out (back to ×1). **Bump** (bank, rock, log): down one lantern.

### Speed

- Target speed through the water by combo: **×1 4.0, ×2 5.2, ×3 6.4, ×4 7.6 m/s**.
- Stroke quality: perfect 1.0, good 0.8, splash 0.3. A stroke surges the boat's speed toward 110% of target × quality
  (`v += (1.1·target·q − v)·0.6`, never lowering it); water drag eases it back about 9% per beat. Steady rowing averages
  the target (the boat lunges on every stroke and settles: visible rhythm). A splash also drops speed to 70% at once.
- Ground speed = boat speed along its heading + the river's current along the river + slipstream.
- **Current:** 0.6 m/s normally, 0.2 in pools, **2.2 m/s in rapids**.
- **Slipstream:** within 7 m behind another boat and 1.6 m of its track: +6% boat speed, the wake sparkles. It lets the
  boat behind catch up and sets up passes.

### Steering

- Each stroke yaws the boat **11°** toward its side, eased in over 0.3 s. Alternating cancels out (a ±5.5° wiggle);
  two on one side turn 22°; both oars turn nothing.
- **The current's pull:** while within 35° of the river's direction, the heading drifts toward it at up to 7°/s, so a
  beginner who simply alternates follows gentle bends. Sharp bends, splits and obstacles need doubled strokes.
- **The bow lantern** throws a real beam (a spotlight) on the water ahead: where it points is where you're going, and
  it lights what's in the way.

### The river

- **Banks:** a bump bounces you back in, speed ×0.55, bow turned 15° away, minus one lantern, 0.6 s before the next bump
  counts. Never fatal.
- **Rocks** (each dream's own: toy blocks, sugar cubes, books, cogs) and **logs** (spoons, page rolls, comets) that drift
  slowly: the same bump plus a 25° spin.
- **Lily pads** (or cloud puffs, ink blots): soft patches, drag doubled while you cross, no lantern lost.
- **Whirlpools** (5 m): spin the boat up to 70°/s and pull it toward the centre at up to 1.2 m/s, both strongest at the
  middle. Three good strokes on one heading row you out.
- **Rapids:** 2.2 m/s current, white water, a standing wave every 7 m that kicks the heading ±5° (alternating), rocks.
- **Splits:** the river parts around an island. The short line is tighter: rapids, rocks, a sharper bend. The long line
  is calm and wide. A clean run through the short line saves 2-4 s.
- Boats touching each other: each page pushes its own boat apart, speed ×0.9, no lantern lost.

### Beginner and expert

- **A beginner** taps roughly on the beat, alternating, sits at ×1-×2, takes the long lines, bumps a bank on sharp bends
  and finishes Bedtime in about 85 s.
- **An expert** keeps ×4 for whole verses, hits mostly perfects (more thrust per stroke), threads doubled strokes into the
  rhythm without dropping a beat, takes every short line, rides wakes to pass, and comes out of the breath with lanterns
  lit: Bedtime in about 60 s. The third star of each stream (rhythm ≥ 85%) and the per-stream leaderboards keep 50-round
  players chasing tenths.

## Streams (the eight dreams)

Each stream is one dream, a fixed course defined as data (so ghosts and leaderboards are fair). Lengths fit 60-120 s for a
good rower at the speeds above. The key moves up through the set.

| # | Stream | BPM | Key | Length | Set pieces | River features |
|---|---|---|---|---|---|---|
| 1 | **Bedtime** | 84 | F | 440 m | river pours from a wardrobe across a moonlit bedroom; a giant bed (split: under it or around), slippers, a nightstand lamp; out the window into the garden | wide (18 m), 2 gentle bends, toy-block rocks, 1 split |
| 2 | **Teatime** | 92 | G | 500 m | giant teacups and saucers, a teapot pouring a waterfall, a sugar bowl | sugar-cube rocks, spoon logs, a whirlpool stirred in a cup, 2 splits, 1 short rapid |
| 3 | **The Staircase** | 100 | A | 560 m | a floating staircase rising out of the water, banisters, picture frames hanging in the mist | 3 step drops (short rapids), banister logs, tighter bends |
| 4 | **Cloudbank** | 104 | B♭ | 600 m | rowing through clouds (mist that hides what's ahead: the bow beam matters), cloud islands, kite strings, a hot-air balloon | cloud-puff pads, 2 splits, long S-bends |
| 5 | **The Library** | 110 | C | 660 m | bookshelf cliffs, open books as islands, a reading lamp | book rocks, page-roll logs, 2 ink whirlpools, a split through a book's spine |
| 6 | **Clockwork** | 116 | D | 700 m | giant clock faces, turning gears | cog rocks, gear whirlpools, 3 pendulums sweeping across the river on the beat (pass between swings) |
| 7 | **Sea of Stars** | 124 | E♭ | 760 m | the dream turns over: the river becomes the night sky, the moon below you, constellations as islands, lanterns hanging upside down | comet logs, galaxy whirlpools, 2 splits |
| 8 | **Morning** | 132 | E | 820 m | dawn: back home, rapids down a quilt, an alarm clock ringing on the beat, curtains, the sun rising behind the finish | the longest rapids with a short line, everything at once |

Every stream starts at a lantern start arch and ends at a **finish arch of paper lanterns** with a calm finish pool.

## Solo

A player alone gets the whole game two ways, both from the Dock:

- **Races with bots:** Ready on the Dock, and five rival rowers fill the start line (the same match as with people,
  see Multiplayer). The host's stream and race length apply.
- **The Dream** (the moon button on the Dock): the eight streams in order on a star chart. Each is a race against three
  named rivals tuned to that stream, plus a translucent ghost of your personal best. Three stars each:
  1. finish,
  2. beat the three rivals (finish first),
  3. rhythm ≥ 85% (rhythm = (perfects + ½ goods) / judged beats).
  Finishing a stream opens the next. Pause (Esc, P, the pause sign, the platform menu, the page hidden), and **Again**
  restarts in under a second. Rival skill per stream rises from 0.15-0.35 (Bedtime: a beginner at ×2 wins) to 0.82-0.93
  (Morning: needs ×4 most of the way).
- How long it lasts: one pass is ~15 minutes, all 24 stars a few hours, and the per-stream leaderboards are open-ended.
- The Dream is a solo activity in the lobby: `room.hideLobby()` while it runs. It ends if a match starts with this player
  in it. In a private server where others are waiting, the host's moon button is dimmed ("Your crew is waiting").

## Multiplayer

- **Public game**, `ow.rooms.join({ maxPlayers: 6, minPlayers: 1, lobby: 'bar', countdown: 0, settings })`. Friends get
  private servers from the platform. The game joins once, on load, before the scene is built.
- **Settings** (the host's, drawn by the game on the Dock's signpost, `room.setSetting`):
  - `stream`: the eight streams (default Bedtime).
  - `race`: One stream / Cup of three (default One). A cup races the chosen stream and the next two.
- **Lobby (the Dock):** drawn by the game: six berths with each player's boat and rower, name and a lantern that lights when
  they're ready (lit lantern with a check vs a dark one: shape, not only colour), a host's crown on the post. The platform's
  Ready strip is the ready/start control: public servers start on the room's own countdown once everyone has readied; private
  servers wait for the host's Start (`room.canStart`). Joining never starts anything. Empty berths offer `ow.ui.showInvite()`.
- **Bots** fill to six boats when a match starts (`createBots(match, { fill: 6, names, skill: [0.35, 0.8] })`), players
  first. They're the six named rowers below, never marked "bot".
- **Match flow** (`createMatch`): `rounds: 'race'` (1 or 3), `introSeconds: 4` (the count-in at the start arch, the only
  countdown), round = one stream, `roundEndSeconds: 6` (the stream's finish order, times and points), results (podium),
  then the Dock. Cup points by place: **10, 7, 5, 3, 2, 1**; ties share. Results stay 14 s in a public server; in a private
  server until the host taps "To the dock" (it calls `endMatch()`).
- **Round end:** when every boat still racing has finished, or **30 s after the first finisher**, or at a cap of the
  stream's par × 2.2 (par = length / 6.5 m/s). Unfinished boats place by distance.
- **Latecomers** watch from the bank: a spectator camera follows the leader, tapping left/right cycles boats ("◀ Wren ▶"),
  labelled "Watching". In a cup they're admitted at the next stream (`admit: 'round'`) into a bot's seat; otherwise they
  race the next match.
- **Leavers:** an away player's seat is held; their boat drifts with the current with a "zZ" over the rower, and keeps
  its place by distance. A reloaded page carries on from `room.me.presence` (position, speed, combo). A player gone for
  good: their boat fades into the mist and is ranked by distance at the end.
- **Host change:** `createMatch` carries the round on from its record; the new host takes over the bots from `host:boats`
  (everything a bot needs is in it, and a bot's per-beat choices are seeded by match, round, bot and beat, so they don't
  depend on which page simulates them).

### Netcode (as simple as the game allows)

- **One clock.** Song time = `room.matchNow()` − the round's start (`record.started`); negative during the intro (the
  count-in). Every page hears and sees the same beat; nothing about the beat is sent.
- **Each page simulates its own boat** (fixed 120 Hz step, pure module) and **judges its own strokes** against the song
  clock. No round trip on a stroke.
- **Presence** (20 Hz, < 200 bytes): `{ s, x, z, h, v, c, k, ls, lq, f }`: distance along the river, position, heading,
  speed, combo (0-3), stroke count, last stroke side and quality, finished. Others are drawn with
  `room.presenceAt(id, { angles: ['h'], snap: 20 })`; a rise in `k` plays their oar animation and splash.
- **Bots** are simulated only on the host's page (same physics, same judge), published as `host:boats`
  (`host.state`, 10 Hz, ~500 bytes); other pages interpolate them.
- **Finish:** a page that crosses the line calls `host.rpc('finish', { t, strokes, perfects })` with its match-clock
  crossing time. The host checks it is plausible (t ≥ length / 10.5 m/s, t no later than now + 0.5 s, the sender's
  presence within 20 m of the line, once per round) and writes `data.finish[id] = t`. Bots' finishes come from the host's
  sim. The host ranks finishers by time (ties to the millisecond share a place: a photo finish), then the rest by distance.
- **Places on the HUD** are computed on every page from everyone's `s`.
- **Validation:** every presence and host-state value is type- and range-checked (finite numbers, s in [−10, length + 60],
  |x|, |z| < 5000, c in 0-3, sides in −1/0/1); bad values are ignored and the last good one stays. Names are drawn as text.
- **Room closes:** 'kicked' → "You were removed" + Row; 'disconnected' → "Connection lost" + Rejoin; 'replaced' →
  "Playing in another tab" + Play here. Each button calls `rooms.join()` again with the same options.

## The song as a round

- Your own strokes **sing**: each on-beat stroke plays the melody notes that fall in that beat (the beat's note at the
  stroke, the eighth notes after it on time), in your boat's voice. A perfect stroke is a full, bright note; a good one a
  softer note; a splash a dull plunk and your voice falls silent until the next good stroke. Row well and you sing the
  whole tune.
- **The other boats are the round.** On your page you are the lead voice; the other boats sing the melody 2, 4 and 6 bars
  behind (boats 5 and 6 an octave lower, at 0 and 2 bars), each in its own timbre, panned and faded by distance. Their
  voices are scheduled on the beat locally (never from network arrival), and sound only while that boat's combo is alive,
  louder as its lanterns light. Six boats rowing well is a choir.
- The accompaniment grows with your combo: ×1 music box and a soft oarlock tock on every beat (the metronome, always on);
  ×2 harp arpeggios; ×3 a strings pad and a cello on the beat; ×4 bells and a hummed choir.

## Timing, latency and calibration

- The song plays on the AudioContext clock, anchored to the match clock at round start and re-slewed by at most 2 ms per
  beat if they drift; a jump over 80 ms (a pause, a hidden tab) re-anchors at the next bar.
- Output latency (`outputLatency`/`baseLatency`, where present) is subtracted so the heard beat, the ripples and the judge
  agree.
- **Timing** (a tuning-fork button on the Dock): a tap test: 8 beats of the tock, tap along, the median offset is saved
  (`ow.save`) and applied to the judge and the ripples; a ± slider (5 ms steps) to fine-tune. After a race, if the median
  offset of your good strokes is more than 25 ms off, the tuning fork gets a small dot.

## Progression and reasons to come back

- **Saves** (`ow.save`): `profile` = `{ v, calib, seenHints, firstRaceDone, dream: { [stream]: { best, stars } }, totals:
  { races, wins, perfects } }`; `ghost-<n>` = the best Dream run of stream n, 5 samples a second, packed (~1-2 KB each).
- **Personal bests** on the Dream chart, the Dock signpost (this stream) and the results.
- **Unlocks:** Dream streams open one by one; rowers' hats unlock with stars (nightcap from the start; scarf at 6 stars,
  beret at 12, sou'wester at 18, crown of moonflowers at 24), chosen by tapping your rower on the Dock.
- **Leaderboards** (9): `stream-1` … `stream-8` (best time, lower is better, any finish) and `wins` (race wins).
- **Badges** (9):

| id | name | how |
|---|---|---|
| `first-stroke` | First Stroke | Row a perfect stroke. |
| `merrily-x4` | Merrily ×4 | Light all four bow lanterns. |
| `perfect-verse` | Perfect Verse | Sixteen perfect strokes in a row. |
| `gently` | Gently Down the Stream | Finish a stream without a single bump. |
| `first-win` | First to the Lanterns | Win a race. |
| `photo-finish` | Photo Finish | Win a race by under a tenth of a second. |
| `choir` | Choir | Finish a race with three or more other people. |
| `dreamer` | Dreamer | Finish all eight streams of The Dream. |
| `life-is-but-a-dream` | Life Is But a Dream | Earn all 24 stars. |

## Rival rowers (bots)

Six named rowers, each with a boat paint, a symbol, a hat and a habit. Their seat's skill (0-1) sets the base; the habit
bends it.

| Rower | Look | Habit |
|---|---|---|
| Mabel | rose boat, ● dots, knitted nightcap | steady as a clock, never risks a short line |
| Otis | ember boat, ▲ chevrons, flat cap | fast and splashy: timing 15 ms looser, always takes the short line |
| Wren | sage boat, ◆ diamonds, long scarf | steering artist: sees obstacles 8 m further, threads splits |
| Barty | lantern boat, ■ checks, bowler | always a hair late: timing biased +35 ms |
| Juniper | lilac boat, ★ stars, beret | perfect timing, timid steering (overcorrects, bumps banks) |
| Pell | cream boat, ♥ hearts, sou'wester | streaky: slips in clusters, then surges |

Bot brain (pure module, also the autoplay for the trailer): each beat it picks a side from the heading error to a racing
line 1.5 + 2·skill beats ahead (double stroke if the error > 6°), dodges obstacles it sees within 18 + 12·skill m, takes
short lines when skill ≥ 0.55, and taps with a timing error drawn from N(bias, σ), σ = 80 − 60·skill ms. It slips (a
miss or a wrong side) with chance 8% − 7%·skill per beat. Its strokes go through the same judge and physics as a player's.

## Balance and timing (the numbers, and how they're checked)

| Thing | Number |
|---|---|
| Judge windows | perfect ±45 ms, good ±110 ms (first race ×1.3) |
| Combo | +1 lantern per 4 on-beat strokes, ×4 max; miss −1, splash to ×1, bump −1 |
| Target speed | 4.0 / 5.2 / 6.4 / 7.6 m/s at ×1-×4 |
| Stroke | surge toward 110% × target × quality (perfect 1, good 0.8, splash 0.3); drag ~9% per beat |
| Splash | speed ×0.7 at once |
| Current | 0.6 normal, 0.2 pools, 2.2 rapids (m/s) |
| Slipstream | +6% within 7 m behind, 1.6 m of track |
| Steering | 11° per stroke over 0.3 s; current's pull 7°/s within 35° |
| Bumps | speed ×0.55, 15° away (rocks/logs 25°), −1 lantern, 0.6 s grace |
| Whirlpool | r 5 m, spin ≤ 70°/s, pull ≤ 1.2 m/s |
| Breath | 4 beats every 48; tempo +4% after each (max +12%) |
| Streams | 440-820 m, 84-132 BPM; good rower 60-105 s, beginner 85-150 s |
| Race end | all finished, first finish + 30 s, or par × 2.2 |
| Intro / round end / results | 4 s / 6 s / 14 s (public) |
| Cup points | 10, 7, 5, 3, 2, 1 |
| Bots | σ 80 → 20 ms, slip 8% → 1% per beat, lookahead 18 → 30 m, skill 0.35-0.8 in races |

Node tests (`node --test`) check them through the pure modules:
- **Judge and combo:** every window edge, double taps, both-oar chords, misses, breaths, the first-race windows.
- **Physics:** steady perfect rowing at ×4 averages 7.6 m/s ±5% at every tempo; ×1 averages 4.0; alternating holds a
  heading; doubles turn 22°; bumps, whirlpools, pads, rapids and slipstream do what the table says; no NaN, no leaving the river.
- **Courses:** all eight streams build (lengths as listed, widths ≥ 8 m, every split's both lines passable, no obstacle
  blocking the whole river, start line fits six boats).
- **Bots:** a skill-1 bot finishes every stream within par; a skill-0 bot finishes within the cap; sharp beats clumsy in
  > 90% of 50 seeds; equal-skill bots spread their wins (no seat or lane advantage); the Dream's rivals land in their
  intended bands (Bedtime beatable at a steady ×2).
- **Races:** whole races of six bots for 100 seeds on each stream: they end in the designed time, places and cup points
  are right, ties share, unfinished boats rank by distance, no exceptions.
- **Room flow** through a fake room: host reload mid-race (bots continue from `host:boats`), a leaver, a latecomer
  watching and admitted at the next stream, a forged finish time refused, a page sending garbage presence.

## Every screen

All screens are the 3D world with type over it; panels are solid ink bands or wooden signs, never glassy cards.

- **Title:** attract mode (bots rowing Bedtime and Teatime, slow cinematic camera passes). Centre-left: "Row Your Boat",
  huge, cream Fraunces, its reflection rippling on the water. Below it: the **Row** button (an oar blade pointing right,
  56 px+ tall, `Space` key cap). Your best Dream stars (e.g. "★ 7") small under it once you have any. Nothing else.
- **Dock (lobby):** a wooden jetty under a string of paper lanterns, six berths. Each berth: the boat, the rower (avatar
  colours, chosen hat), a lantern tag with the name (DM Sans bold, cream on ink), ready lantern, host crown. Your berth is
  lit by a warm spotlight and an arrow. Left of the berths, **the signpost**: "Bedtime ‹ ›" and "One stream / Cup of three"
  (host taps to change; others see the values), with your best time on that stream. Top right (clear of the platform
  menu): the **moon** button (The Dream) and the **tuning fork** (Timing). Bottom: the platform's Ready strip (kept clear).
  Portrait: the berths in two rows of three, the signpost above them. Watchers of a running race see that race instead,
  labelled "Watching · next race soon".
- **Intro (4 s):** behind your boat at the start arch; the stream's name painted across the water in Fraunces ("Teatime")
  and, in a cup, "Stream 2 of 3"; the arch's three lanterns light on the count-in.
- **Play HUD:** top right: your place, a huge numeral with a small suffix (cream, thick dark outline), the race time under
  it, and in The Dream the gap to your ghost (+0.8 / −1.2). Right edge: a thin vertical river from start to arch with each
  boat's symbol at its distance (yours bigger). In the world: the bow lanterns (combo), the ripples (beat), the oar line,
  judgement words ("perfect", "good", "splash") rising small and quick from the oar that stroked. After the first finisher:
  the finish arch's lanterns go out one by one over the last 30 s, and a "0:24" on the arch. Hints centre, at ~38% height.
- **Finish:** crossing the arch: a burst of paper lanterns and sparks, a bell chord, a short slow-motion beat (not in
  reduced motion), your place stamped big ("2nd"). The boat rows itself into the finish pool while the camera circles.
- **Between streams (cup, 6 s):** the finish pool; a ranking band (solid ink): place numeral, avatar head, name, time or
  "+3.4", and the points flying into each total.
- **Results (podium):** three stacks of giant pillows (3, 2 and 1 high) in the finish pool, the top three rowers standing
  on them waving, paper-star confetti; below, the full ranking band; your line: place, time, "New best!", rhythm %. Private
  host: "To the dock". Badges are the platform's notices.
- **The Dream chart:** the night sky as a winding river of stars from bottom to top; eight moon-phase nodes, each with the
  stream's name, three star slots, your best time; locked ones dim with a padlock shape. Tap a node: a wooden sign with the
  stream's name, best, the stream's top 3 from its leaderboard, and **Row**. Back (top right).
- **Dream pause:** a wooden sign: Resume, Again, Leave the dream. **Dream finish:** stars stamp in one by one (each with a
  bell), best time, rhythm %, Again (R) and Next stream.
- **Timing:** the tock and a pulsing ripple; "Tap with the tock" then the result in ms with the ± slider and Done.
- **Room closed:** one line and one button over the river (see Netcode).

## Art direction

- **The world:** a dream at night: a dark river running through oversized everyday things (a bedroom, teacups, books,
  clocks, clouds), lit by the moon and paper lanterns. Soft-edged low-poly with smooth shading, real light, mist, and
  pastel giants against deep blue. Moonlit and calm, never neon.
- **Palette:**

| Role | Hex |
|---|---|
| Night indigo (sky, deep water, panels) | `#141A3A` |
| River blue (water, shadow side) | `#2B3F7C` |
| Moonlight cream (text, moon, perfect) | `#F4EBD0` |
| Lantern amber (accent, warmth, good) | `#FFB547` |
| Dream rose (pastel giants, highlights) | `#F2A7B6` |
| Ember (splash, bumps, warnings) | `#E5533D` |

  Boat paints: rose, ember, sage `#9CC5A1`, lantern, lilac `#B7A5E8`, cream, each with a symbol (●▲◆■★♥) on the bow pennant.
  `ow.ui.setLook({ accent: '#FFB547', panel: '#141A3A', text: '#F4EBD0' })`.
- **Fonts** (self-hosted, `@fontsource`): **Fraunces** (variable, soft and heavy, 800-900) for the name, places,
  stream names and big numbers; **DM Sans** (500, 700) for names, labels and buttons. No uppercase letter-spaced labels.
- **The signature: the beat ripples.** Silver moonlit crests rolling down the river onto the oars, and everything else
  breathing with them: bank lanterns swell on the beat, the giants bob, the Dock's string of lanterns sways, the title's
  button pulses, results rows enter on beats.
- **Light and camera:** the moon as a cool directional light with soft shadows (tight shadow box around the boats; map
  size by quality: none / 1024 / 2048), a hemisphere light (indigo sky, black water), your bow lantern as a warm spotlight,
  the three nearest bank lanterns as real point lights (a fixed pool that moves), the rest emissive. ACES tone mapping,
  sRGB, exponential fog in indigo, layered mist sprites at water level. Water: a custom shader (flowing ripples along the
  river, a moon path, lantern streaks, foam in rapids and at bumps, the beat ripples). Bloom on lanterns at high quality only.
  Camera 7 m behind, 3.2 m up, looking 10 m ahead; it lags the heading smoothly, leans into turns, bobs on the beat, and
  pushes in slightly at ×4. Portrait: higher and wider (more river ahead). Shake from decaying trauma² on bumps only.
- **Boats and rowers:** small clinker-built wooden boats (planked lathe hull, a painted band, the pennant and four bow
  lanterns). Rowers are simple stylish figures: a knitted jumper in the player's shirt colour, skin from the avatar, a hat
  (nightcap with a pompom by default), arms that pull with each stroke; they face the camera and lean back on every pull.
  Other players' boats carry a small name tag. The ghost is a translucent moonlit boat with no rower.
- **The HUD in the world's language:** combo as lanterns on the bow, beat as ripples on the water, the finish clock on
  the arch, the place in big cream numerals, the progress as a little river.
- Reduced motion: no shake, no slow motion, no flashes; ripples and lanterns stay (they are the game), gentler particles.

## Sound

All synthesized in Web Audio, from one small sequencer in the song's key.

- **Strokes:** perfect: your voice's note (music box) + a clean water plip + a high sparkle; good: the note softer +
  a splash; splash: a dull low plunk + a messy spray of noise; miss: a soft oarlock creak; both oars: a fuller splash.
- **Combo:** each lantern lighting: a whoomp and a harp run of 2-4 notes up; lanterns snuffing: a soft "pff" (filtered noise
  falling).
- **River:** bank bump: a wooden thonk + slosh; rocks a knock; logs hollow; pads a soft squelch and petals; whirlpool a
  swirling filtered noise; rapids a rushing bed that grows with the current; slipstream a shimmering tremolo.
- **Race:** count-in: three tuned bells, then the first beat; overtaking: a short rising two-note chime; finish: a bell
  chord, lantern pops; winning: the last phrase "life is but a dream" in full harmony with the choir; losing: the same
  phrase, gentle, on the music box.
- **Music:** the song (above): the round of voices over harp, strings, cello and bells, louder in play, a slow music-box
  version at 60% in menus, a held chord with wind chimes in the breaths. Ambience: water lapping, crickets, distant bells.
- UI: wooden taps for buttons, a page-turn for the Dream chart.

## Store art and the trailer

- **Cover (`thumb-1`):** six boats abreast on the moonlit river under a giant floating teacup, beat ripples rolling onto
  the oars, lanterns, spray from perfect strokes; "Row Your Boat" once, big.
- **Action (`thumb-2`):** low and close: a boat crashing through the Morning rapids, water flying, lanterns swinging, the
  rower leaning back mid-pull.
- **Win (`thumb-3`):** a boat crossing the lantern arch first, a burst of paper lanterns, the others just behind.
- **Multi (`thumb-4`):** six boats in a pack through the Library's bookshelf canyon.
- **Icon:** one little wooden boat from three-quarters above, bow lanterns lit, nightcap rower, on indigo water inside a
  silver ripple ring. No text.
- **Badge art:** each a bold symbol on a coloured disc (an oar, four lanterns, a note, a calm wave, a lantern arch, a
  camera shutter, three voices, a moon, a crescent of stars).
- **Trailer (25-30 s):** frame 0 behind a boat at ×4 in Teatime, ripples hitting the oars, the arch visible (the goal) →
  a turn in rhythm around a teacup island on the short line → dream set pieces (out of the clouds, the staircase) → the
  Morning rapids, a bump on a rock, the recovery → six boats neck and neck into the lantern arch, a photo finish → the
  pillow podium → "Row Your Boat" over the river (the title screen) for the last 2 s. Captured with the autoplay
  (`?autoplay=1`, not in production: the local boat driven by the bot brain).

## Originality check

- **It resembles:** canoe games where alternating paddles go straight and one side turns; rhythm games with a note
  highway; kart racers.
- **What a player notices in the first minute that is different:** the throttle is the beat (there is no go button: you
  are as fast as your rhythm), the notes are ripples rolling down the river onto your oars, your strokes sing the tune and
  the other boats join as a round, and the river runs through a dream of giant teacups and bedrooms. No items, no drifting,
  no lanes.

## Risks and how they're handled

- **Latency and fairness** (Bluetooth headphones, phones): judge on the audio clock with output latency subtracted, the
  tap-test calibration, the dot that suggests it, and generous good windows. Each page judges itself, so network lag never
  touches timing.
- **Steering confusion:** tap the way you want to go; the current's pull on gentle bends; the bow beam shows the heading;
  hints only when needed. Tested cold on the first race.
- **Clock drift** between the match clock and audio: slewing and re-anchoring (above); visuals follow the same mapping.
- **Phones and 3D cost:** under ~200 draw calls (merged static banks and set pieces per stream, instanced props), a fixed
  pool of 4 real lights, shadows and bloom by quality, pixel ratio from `ow.settings.pixelRatio(2)`, pause when hidden.
  Quality: low = no shadows, simple water, half the props; medium = 1024 shadows; high = 2048 shadows + bloom.
- **iOS audio:** the Row tap unlocks audio; after a match started from the platform strip, a "Tap to row" hint stays until
  the first tap in the game (that tap is also the first stroke).
- **Scope of eight dreams:** one shared kit (banks, rocks, logs, pads, whirlpools, lanterns) re-skinned per dream, 2-4
  hero set pieces each from primitives, streams as data. Build order: Bedtime end to end (solo, race, bots, sound, look),
  then the room, then the other seven.
- **Forged finish times:** plausibility checks on the host; leaderboards are for fun.
- **The song:** "Row, Row, Row Your Boat" is a traditional 19th-century round in the public domain; the arrangement is the
  game's own.

## Tech and files

- Vite + three.js (pinned), `@fontsource-variable/fraunces`, `@fontsource/dm-sans`. No physics library: the boat physics
  is a small 2D simulation on the river plane. `"dir": "dist"`, `base: './'`.
- `src/sim/` (pure, tested in node): `streams.js` (the eight courses as data), `course.js` (centreline, widths, current,
  obstacles, nearest-point lookup), `song.js` (melody, tempo map, breaths, beat times), `judge.js` (windows, combo),
  `boat.js` (physics), `bot.js` (the brain), `race.js` (places, finish checks, ranking, cup points), `rng.js`.
- `src/` (browser): `main.js` (boot, join, screens), `net.js` (room, match, host, bots, presence), `audio.js`
  (sequencer and effects), `render/` (world, water shader, boats, set pieces, effects, camera), `ui/` (HUD and screens),
  `poster.js` (store art), `autoplay.js`.
- `test/*.test.mjs` for everything in `src/sim` plus a fake room.

## Changes from the spec

- **Steering:** tap the side you want to turn toward (two on the left turn left). The spec had real rowing physics (the
  boat turns away from the doubled side); a stranger presses the side they want to go, so this reads in seconds.
- **Rapids don't change the tempo:** every boat shares one beat (the round only works that way), so rapids are fast water
  and waves instead, and the tempo rises 4% after each breath.
- **The beat indicator** is ripples rolling onto the oar line (readable like a note highway) instead of a bead on the
  gunwale; the oarlocks and bank lanterns still pulse.
- **Choir:** each page hears itself as the lead and the others as the round behind it, scheduled on the beat locally.
- **Stream lengths** 440-820 m (not 600-1,400) so races take 60-120 s at the spec's speeds.
- **Added:** slipstream (+6%) so the boat behind can catch up; both-oar chords count as a straight stroke.
- **Badges:** Choir is "three or more other people" (bots always fill six boats); added First to the Lanterns.
- **Countdown:** the game's own 4 s count-in at the start arch (`countdown: 0`, `introSeconds: 4`), so there is one.
