# Soundtracks Directory

Drop audio files (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`, `.aac`, `.webm`) in here and the
build publishes them through `manifest.json`. A file claims the slot whose **longest**
keyword appears in its filename — case does not matter and the rest of the name is ignored,
so `Cul_de_Sac_Clockwork.ogg` and `03_stage2_suburbia.ogg` both land on stage two.

Longest match rather than first match, because `stage1_boss.mp3` contains `stage1` and was
loading as the stage one gameplay track, leaving the boss slot on the synth. A file whose
name matches nothing is ignored rather than guessed at: the previous version assigned by
position, which is how a ten-track soundtrack ended up alphabetical — the title screen
played the stage one theme and six tracks never loaded.

| # | Track | Slot | Plays during |
|---|---|---|---|
| 01 | Last Coin Standing | `INTRO` | Coin and title screen |
| 02 | Night Shift Access | `CHAR_SELECT` | Character select |
| 03 | Concrete Insurrection | `STAGE1` | Stage 1 — Neon Nightlife District |
| 04 | Iron Verdict | `STAGE1_BOSS` | Stage 1 boss — Sayonara |
| 05 | Cul-de-Sac Clockwork | `SUBURBAN_GRAY` | Stage 2 — Monochromatic Suburbia |
| 07 | Sector Nine Siege | `STAGE2_BOSS` | Stage 2 boss — Mizydia hologram |
| 06 | Liturgy of Iron | `SACRED_METAL` | Stage 3 — Mega-Church Corporate HQ |
| 08 | Iron Sacrament | `FINAL_BOSS` | Final boss — Mizydia and Sayonara |
| 09 | The Gray Perimeter | `GAME_OVER` | Defeat screen |
| 10 | Running Toward The Sun | `VICTORY` | Ending screen |

Any slot without a file falls back to the built-in 16-bit synth engine, so the game is
never silent.

Tracks play with `loop = true`. **Prefer `.ogg` or `.wav` over `.mp3` for anything that
loops**: MP3 stores encoder padding inside the file — roughly 25 ms of silence at the head
and up to 26 ms at the tail — and that gap plays back on every cycle.

The intro sequence has its own track at `public/assets/intro/intro_theme.ogg`. It is not a
BGM slot: the sequence loads it directly and loops it back to the drop at 44.308s rather
than to the top, so the title frame never falls silent. Keep it out of this folder or the
manifest will assign it to a slot.

Slots are declared in `src/game/bgmTracks.ts`. The type, the runtime list, the jukebox rows,
the matching above and the synth fallback all derive from that one table.
