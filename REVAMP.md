# Row Your Boat: the revamp

A teardown of the first build (main at 99eb734), played headless from the Dream with the local autoplay and looked at
frame by frame, then the plan that answers it.

## What is wrong with it

### It looks cheap

- **The water is a flat road.** One matte blue strip with hard edges where it meets the banks. Nothing reflects in it: not
  the lanterns, not the boats, not the giant teacups. Bright lights (the bow lamp, the stern lamp, bloom) wash its middle
  out to a white smear. It is 60% of every frame and it reads as tarmac.
- **The beat ripples look like road markings.** Full-width white arcs plus a second white "oar line" with brackets: the
  signature element is the cheapest thing on screen.
- **The banks are slabs.** A flat strip of one colour per dream, a sharp crease at the water, nothing growing on them,
  no shoreline, no wet edge, no rocks, no grass, no reeds. The river runs through nothing.
- **The set pieces are primitives in fog.** Cylinders as teacups, boxes as beds and wardrobes, untextured and mostly
  unlit, so they read as dark silhouettes. No material reads as porcelain, wood, fabric or brass.
- **The rower is a capsule with a ball head.** Dot eyes, stick arms that stretch, no hands, no face, no clothes, no
  silhouette. Every rower is the same body in a different colour.
- **The boat is a shoebox.** A smooth hull with a flat brick of a transom, no planks, no ribs, sticks for oars.
- **The bow "lanterns" are a glowing vertical bar.** Four spheres on a pole that bloom into one smear: the combo is
  unreadable from the camera.
- **The sky is a gradient with dots,** a flat sprite moon, no clouds, no depth. Mist sprites are the only atmosphere.
- **The start arch's lanterns are blown-out yellow ovals** filling the top of the first frame.

### It moves stiffly and feels floaty

- The boat slides like a cutout: it barely pitches on a stroke, never digs in, never lifts its bow.
- Oars swing on fixed arcs with no catch, no drive through the water, no drips on the recovery, no swirl left behind.
- Nothing in the water reacts to the boat except a faint V: no splash rings, no bow wave, no puddles where the blades went.
- The camera is bolted behind the boat: no look-ahead into bends, no lean, no punch on a big moment, no sense of speed.
- Perfect strokes give a small grey word and a few dots; a bump gives a tiny shake. No hit-stop, no flash, no lift.
- The finish is a stamp and some sparks; the podium is rowers floating on pastel boxes.

### It reads unclear

- From behind the rower, the river ahead is blocked by the rower and the bow pole.
- The judgement words ("perfect", "good") are small grey serif text that disappears into the water.
- The combo (lanterns) can't be read; the speed it gives can't be felt.

### It is boring after one round

- **Every beat is the same.** One tap per beat for two minutes. The song has rhythm (the "merrily" triplets, the long
  notes) but the game ignores it: there is nothing to read, no pattern to learn, no section to look forward to.
- **No short-term goals.** Nothing to grab, no near-misses that pay, no score. Steering only matters at the rare rock.
- **No reason to play again.** Stars for eight streams, then nothing. No levels, no unlocks except four hats behind stars,
  no currency, no daily anything, no streak, no goals that change. The Dock is a menu, not a place you want to be.
- **Bots race in a line.** Without anything to fight over (a line through pickups, a wake to steal, a power stroke to
  answer), the race is decided by rhythm alone and looks the same every time.

## What the best games of its kind do that this doesn't

- **Taiko no Tatsujin / Rhythm Heaven:** the chart IS the song. Big notes (hit both sides) and drum rolls make patterns
  you learn and look forward to; the hit feedback is enormous.
- **Sayonara Wild Hearts / Thumper:** the world performs the music: every hit lights something up, the scenery moves on
  the beat, the camera dances. Short levels with a score you want to beat.
- **Mario Kart / Wave Race:** lines through pickups, drafting, shortcuts with risk, water that looks alive and throws
  you around, and a reason (cups, unlocks, ghosts) to run it again.
- **Trackmania:** medals, ghosts, instant restart, track of the day for everyone.
- **Alto's Odyssey:** a gorgeous, specific world with weather and time of day; goals in threes; a currency that buys
  things you want.

## The rebuild

### Look: one art direction, applied everywhere

"Moonlit dream" made real: deep indigo night, warm paper-lantern light, and water that **mirrors** both.

1. **Water:** a real planar reflection (half resolution, medium/high quality) of the sky, moon, lanterns, boats and set
   pieces, broken up by flowing normals; Fresnel, deep and shallow tints, a wet dark shoreline with lapping foam, moon
   glitter, splash rings left by every oar blade, bow waves and wakes. Low quality keeps a cheap faked reflection.
2. **Beat ripples, redone:** a moonlit swell rolling down the river (a crest that catches the light and sparkles, not a
   painted line), brightening as it nears the oars. The oars' target is two small glowing marks where the blades enter.
   Golden swells for power strokes; small droplet ripples for the "merrily" triplets.
3. **Banks with a shoreline:** sloped banks with a wet edge, stones, grass, reeds, flowers and glowing mushrooms
   (instanced), per-dream ground (floorboards with a rug's edge, a tablecloth, marble, cloud, carpet, quilt).
4. **Set pieces with materials:** glazed porcelain (clearcoat, painted patterns), varnished wood, quilted fabric, brass;
   bevelled shapes, more of them, lit by the moon and their own lamps.
5. **Sky:** painted gradient, a big moon with halo, layered moonlit clouds, twinkling stars, shooting stars.
6. **Light and post:** moon key with soft shadows, a sky-matched environment map for glints, warm lantern pool lights,
   ACES, colour grade (indigo shadows, warm highlights), vignette, bloom tuned to the lanterns only, height fog/mist.
7. **The rower:** a skinned character with a real face (eyes that blink, cheeks), knitted jumper (sheen), mittens, a hat
   with a floppy tip on a spring, a scarf that trails. Rowing by IK to the oar handles: reach, catch, lean back, finish,
   recover; head turns to look over the shoulder at bends; cheers, waves, slumps, all blended.
8. **The boat:** lapped clinker planks, painted strakes and a gunwale stripe, ribs and thwarts, brass oarlocks, shaped
   oars with painted blades, and the combo as **four paper lanterns on a garland** over the boat, each lighting with a pop.

### Feel

- Strokes: the bow lifts and the boat lunges on the drive; single-side strokes roll it; blades leave swirls and drip on
  the recovery. Perfect: a white-gold burst, a ring of light on the water, a short camera kick. Bumps: hit-stop, a
  directional shake, a splash over the gunwale.
- Camera: smooth follow with look-ahead into bends, lean into turns, FOV that opens with speed, punch-in on big moments,
  slow motion at the finish (not with reduced motion).
- Speed you can see: streaks on the water, spray off the bow, a wake that grows with the lanterns.
- UI that moves: counts tick, panels slide, buttons press, rewards fly into their totals.

### Depth: the song becomes the chart

- **Pull! (gold swells):** the long notes of the tune ("Row, row," "stream," "dream") come as gold swells: both oars
  together for a power stroke (a big surge). One oar still counts, so beginners lose nothing; experts plan their steering
  around the gold beats, since a pull can't turn.
- **Merrily rush:** the "merrily, merrily, merrily, merrily" bar brings small droplet ripples between the beats. Tap them
  too, alternating, and you play the tune's triplets yourself: each one adds a push; all twelve is a "Merrily!" burst.
  Optional for beginners, the biggest skill test for experts.
- **Moonblooms:** glowing water-lilies floating in lines on the good and the risky lines. Steering on the beat to collect
  them is the moment-to-moment goal; each gives a chime and a nudge, and they are the currency.
- **Close shaves:** slipping past a rock or a log within a hand's width pays blooms and a little push.
- A score for every run (rhythm, pulls, rushes, blooms, shaves) next to the time.

### Reasons to come back

- **Rower level:** XP from every race and run, a reward track of 30 levels: boats (rowboat, canoe, swan, teacup, paper boat,
  bathtub, walnut shell), hats, paints, lantern colours, oar trails.
- **The Boathouse:** spend blooms on paints, lantern colours and wake trails; dress your boat and rower; others see it.
- **Tonight's Dream:** one stream a day with a twist (mirrored, fog, swift tempo, golden night, rapids), the same for
  everyone, with today's board.
- **The moon calendar:** a streak of nights; each night lights the next phase of the moon; a full moon pays a prize.
- **Three wishes a day:** small goals ("40 perfect strokes", "6 pulls", "a full merrily rush") for XP and blooms.
- **Per-stream goals:** the three stars, plus every bloom collected (a lily mark on the chart).
- Badges that mean something.

### Order of work

1. Water, sky, light, post. 2. Boat, rower and their animation. 3. Banks and set pieces, dream by dream. 4. Juice and the
camera. 5. Pulls, rush, blooms, shaves, score (sim + tests). 6. Levels, Boathouse, daily, wishes, streak (save + tests).
7. UI and sound. 8. Bots that use the new moves; balance. 9. Store art, trailer, docs.
