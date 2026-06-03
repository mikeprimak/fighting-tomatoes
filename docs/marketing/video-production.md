# Video Production Playbook (TikTok + YouTube)

**Status:** In progress — being built over multiple sessions.
**Started:** 2026-06-02
**Owner:** Mike (solo, faceless production — no on-camera, no live).
**Editor:** OpenShot (desktop). Voice: ElevenLabs (planned). Budget: fits inside the $100/mo marketing line.

This doc is the source of truth for the video workstream. Come back here to continue. Each session: read this top-to-bottom, pick the next unchecked item in **Roadmap**, log what changed in the **Session Log**.

---

## 1. The Strategy (why we're doing it this way)

**Evergreen-first, not fight-week-first.** Most fight content is perishable — it dies in 48 hours. The platforms reward content that *compounds*: build once, the algorithm serves it for months/years. For a solo operator with limited hours, evergreen is the only model that scales. Fight-week content is a treadmill; evergreen is an asset that accrues value — same logic as the app's sale thesis.

- **Library (≈80% of effort):** evergreen videos built from historic data we already have. No deadline pressure, no "post within 2 hours of the main event" stress.
- **Spikes (≈20%):** occasional fight-week videos that ride a trending moment that already exists. We don't abandon fight weeks — we just stop treating them as the foundation.

**The moat = the data overlay.** Our only durable edge is *aggregated fan opinion at scale*. Everyone else does "here's MY top 5." We do "here's what 1,200 fans actually rated." The on-screen rating number — "X fans decided this" — is the entire differentiator. The second a video looks like a generic highlight reel, we're competing with 10,000 channels. **Put the numbers on screen in every single video.**

**Faceless is a feature, not a limitation.** No camera, no voice-of-Mike required. The app's data does the talking. This fits the solo-introvert constraint and removes the biggest friction to actually shipping.

---

## 2. Format Library (evergreen — never expires)

Pick from these. All are timeless because they're tied to *fights/fighters/searches*, not dates.

1. **The all-time canon** — "The 5 highest-rated fights in UFC history (per X fans)." *(This is video #1 — see §6.)*
2. **Fighter-legacy retrospectives** — "Every Conor McGregor fight, rated by fans." Tied to a fighter's *name* (eternally searched). Also surfaces the follow-fighter dataset.
3. **The settled argument** — "Was [classic fight] actually that good? The data says…" Fans re-litigate classics forever.
4. **Era / division deep-cuts** — "The best fight in every weight class, according to fans." / "Most underrated fight of every year since 2015."
5. **Hidden-gem discovery** — "Underrated fights to watch if you're new to MMA." Letterboxd's whole evergreen engine; positions the app as *discovery*, not scores.

**Inventory advantage:** we have years of already-rated historic fights. We can batch ~30 evergreen scripts from data that exists *today* — no waiting on fight week.

**Fight-week spike formats (use sparingly):** pre-card "which fight will fans rate highest?", post-card "fans just rated the main event an 8.7 — here's the breakdown." Top-of-funnel; app is the CTA.

---

## 3. The Template (reusable shell)

Worked example format: **all-time canon countdown**, 60–75 sec, vertical 9:16.

**Five beats:**

| Beat | Time | On screen |
|---|---|---|
| **Hook** | 0–3s | Bold claim + the #1 number **blurred**. "Thousands rated every UFC fight. One scored a 9.76." |
| **Tease** | 3–7s | Flash all 5 fighter headshots fast. Promise the payoff. |
| **Countdown** | 7–60s | One card per fight (~10s): fighter photos, matchup, **giant animated rating number ticking up**, one visceral sentence of why. |
| **Payoff (#1)** | 60–70s | Slow down. Build it. Un-blur the #1 number. It lands big. |
| **CTA** | 70–75s | "Rate them yourself on Good Fights. Never miss a Good Fight." Logo + app name. |

**The retention trick (don't cut it):** cold-open on the #1 number *blurred* — "the #1 fight scored a [blurred] — here's the countdown." People stay to un-blur it. Worth more than any edit.

**Writing rule:** one *visceral* line per fight (blood, smiling, final seconds), not a stats dump. Emotion retains; the rating number carries the data weight. On-screen vote counts stay honest per-fight (167, 191…); the voice can say "thousands" because that's true app-wide.

---

## 4. Make it LOOK good (adapted for OpenShot)

- **One visual system, reused forever.** Dark background (matches the app — it's dark-only, so the video feels native to the product). Brand accent color on every rating number. Same font everywhere. Build this once as an OpenShot project template and duplicate it per video.
- **The rating number is the star.** Big, animated, counts up with a pop. In OpenShot: a Title clip with **property keyframes** on Scale (0.8→1.1→1.0) + Alpha for the pop. This is your signature beat — most polished element in every frame.
- **Motion = life.** Static text dies on these platforms. Slide/scale everything in via keyframes on the clip's Properties panel (Location X/Y, Scale, Alpha).
- **Fighter headshots** pulled from our R2 store = consistent, clean, ours. (Same images the app uses.)
- **Title cards:** OpenShot's built-in Title editor (SVG templates) for simple cards; **Animated Titles** (Blender-backed) if you want fancier intros — heavier, optional.

### ⚠️ OpenShot's weak spot: captions
OpenShot has **no auto-caption** feature (CapCut's big advantage). 85% of viewers watch muted, so captions are non-negotiable. Workarounds, easiest → most control:
1. **Generate captions externally, burn them in:** run the audio through a free transcriber (e.g. an SRT exporter), then add the SRT in OpenShot (Title → import, or as a subtitle track). Decide on a tool in a future session.
2. **Manual Title clips** for short videos — tedious but total control over the punchy word-by-word look.
3. **Last resort:** export clean from OpenShot, add captions + trending audio in the TikTok app itself before posting (TikTok has built-in auto-captions). Good for TikTok; you'd still need burned-in captions for the YouTube upload.

> **Open decision:** pick the caption workflow (see Roadmap). This is the main thing OpenShot doesn't do for us out of the box.

---

## 5. Make it SOUND good

- **Voiceover — AI, not Mike's voice.** Use **ElevenLabs** (~$5–11/mo). Pick ONE confident, slightly warm male voice and reuse it every video so it becomes "the Good Fights voice." Script ≈120 words per video. Retention is much higher with a voice than text-only.
- **Each rating number is spoken AND pops on screen** — sync the audio hit to the visual pop.
- **Music bed:** energy under the voice, swell on the #1 reveal.
  - **TikTok:** add a **trending sound** in the TikTok app *after* exporting from OpenShot (huge algorithm boost; you can't get trending sounds inside OpenShot).
  - **YouTube:** licensed library track — YouTube's free Audio Library to start, Epidemic Sound later.
- **SFX punctuation:** a "tick/pop" when each number lands, a "whoosh" on transitions. Tiny effort, big perceived-quality jump — this is what separates amateur from pro.

---

## 6. Worked Example — Video #1

**Format:** all-time canon countdown. **Title:** "The 5 Highest-Rated Fights in UFC History (per our fans)."

### The data (locked 2026-06-02)
Top 5 COMPLETED UFC fights by `averageRating`, min 10 votes. These are genuine FOTY-caliber wars — the data produces *canon*, which is the credibility the format needs.

| # | Fight | Rating | Votes | Event | Finish |
|---|---|---|---|---|---|
| 1 | Glover Teixeira vs Jiří Procházka | 9.76 | 167 | UFC Fight Night (Jun 11, 2022) | Sub (RNC) R5 |
| 2 | Cub Swanson vs Doo Ho Choi | 9.66 | 191 | UFC 206 (Dec 10, 2016) | Decision |
| 3 | Robbie Lawler vs Rory MacDonald | 9.59 | 251 | UFC 189 (Jul 11, 2015) | TKO R5 |
| 4 | Michael Johnson vs Justin Gaethje | 9.58 | 144 | TUF 25 Finale (Jul 7, 2017) | TKO R2 |
| 5 | Dan Henderson vs Maurício Rua | 9.55 | 131 | UFC 139 (Nov 19, 2011) | Decision R5 |

> Note: ratings drift as users keep rating. Re-run the query before final render in case the order shifts. #6–7 (Schnell vs Mudaerji 9.51, Reyes vs Ma 9.49) are on the bubble.

### Voiceover script (≈120 words, ~50 sec)

> **[HOOK — blurred 9.76 on screen]**
> Thousands of fight fans rated every fight in UFC history. One scored a *nine-point-seven-six.* Here are the five greatest — counting down.
>
> **[#5 — Henderson vs Rua, UFC 139]**
> Number five: Dan Henderson and Maurício Rua. Five rounds of two legends refusing to fall. Nine-five-five.
>
> **[#4 — Johnson vs Gaethje]**
> Number four: Justin Gaethje's debut. A war he probably shouldn't have won. Nine-five-eight.
>
> **[#3 — Lawler vs MacDonald, UFC 189]**
> Number three: Lawler and MacDonald — staring each other down, bleeding, *smiling.* Nine-five-nine.
>
> **[#2 — Swanson vs Choi, UFC 206]**
> Number two: Cub Swanson, Doo Ho Choi. Possibly the best three rounds ever. Nine-six-six.
>
> **[#1 — unblur — Teixeira vs Procházka]**
> And number one… Glover Teixeira, Jiří Procházka. Insane back-and-forth, decided in the final *seconds* of round five. Nine-point-seven-six. The highest-rated fight in the app.
>
> **[CTA]**
> Rate them yourself on Good Fights. Never miss a Good Fight.

---

## 7. Tool Stack & Data Source

| Need | Tool | Notes |
|---|---|---|
| Editing | **OpenShot** (desktop) | Project template + keyframe number-pop. No auto-caption (see §4). |
| Voiceover | **ElevenLabs** | One reused voice. ~$5–11/mo. Not set up yet. |
| Captions | TBD | Open decision — external SRT vs manual vs in-app. |
| Music (TikTok) | TikTok trending sounds | Added in-app post-export. |
| Music (YouTube) | YouTube Audio Library → Epidemic later | Licensed. |
| Screen capture | Phone / Mac built-in | For app captures. |
| Headshots/graphics | R2 store + Canva | Same images as the app. |

**Data query (reusable):** `packages/backend/scripts/top-ufc-fights.js`
- Pulls top COMPLETED UFC fights by `averageRating`, min 10 votes, with fighter names + event + method.
- Run from `packages/backend/`: `node scripts/top-ufc-fights.js` (auto-loads `.env` → Render DB).
- Generalize later for other formats (per-fighter, per-weight-class, per-year) — it's the content engine for the whole library.

**Copyright stance:** **graphics-forward, NOT highlight-forward.** UFC footage is copyrighted; highlight channels use it under a fair-use gray area, but this is a brand asset we may sell, so we avoid a copyright-strike history. Build from app screen recordings, headshots, and motion graphics — almost no raw fight footage. This is also the moat (nobody else can make "the data video").

---

## 8. Roadmap (next sessions pick from here)

- [x] Strategy + format library decided (evergreen-first, data moat).
- [x] Template structure defined (5-beat countdown).
- [x] Video #1 data pulled + script written.
- [~] **Build the OpenShot project template** — full spec written (§9); brand kit + tracks + 5 signature elements + beat build locked. Remaining: actually construct it in OpenShot + save the shell.
- [ ] **Decide the caption workflow** (§4 open decision) — pick a transcription/SRT tool and test it in OpenShot.
- [ ] **Set up ElevenLabs** — pick the voice, record the video #1 script.
- [ ] **Source the visuals** — export fighter headshots from R2 for the top 5; gather any safe B-roll.
- [ ] **Cut video #1** end-to-end as the template proof.
- [ ] **Decide posting strategy** — TikTok vs YouTube priority, cadence, install attribution (UTM on the bio link — see `utm-conventions.md`).
- [ ] Batch the next 3–5 evergreen scripts from existing data.

## Open Questions
- Caption workflow (the one thing OpenShot doesn't solve natively).
- ~~Exact brand accent color / font~~ → RESOLVED (§9.0): gold `#F5C518`/`#181818`, Anton + Inter.
- Bio-link / CTA destination + UTM tagging for install attribution.

---

## 9. The OpenShot Template Build Spec (the reusable shell)

> **Decisions locked 2026-06-03:** motion = **Premium & restrained** (slow eases, gentle overshoot, sparse SFX); rating number = **Number Pop** (OpenShot-native, no count-up); font = **Anton sheared** for all animated text. The real wordmark is an AI-generated PNG (font unknown / likely not a real face) — so the wordmark is **always used as a PNG asset**, never re-typed; any big static headline can be generated as a matching-style PNG (ChatGPT, same as the wordmark) rather than set in a font.

This is the exact, build-it-once spec. Construct it once, **Save As `GOODFIGHTS_TEMPLATE.osp`**, then duplicate the file per video and only swap the headshots, names, numbers, and VO. Everything below is OpenShot-native — no plugins.

### 9.0 Brand kit (LOCKED — pulled from app design tokens)
| Token | Hex | Use |
|---|---|---|
| Gold accent | `#F5C518` | Rating numbers, key words, watermark, bars, the wordmark |
| BG base | `#181818` | Background fill (matches app, video feels native) |
| Panel | `#202020` | Cards / lower-third strips behind text |
| White | `#FFFFFF` | Fighter names, body text, captions |
| Gray | `#9CA3AF` | Secondary text (event, vote counts, "fans") |
| Red | `#EF4444` | Sparingly — the "VS", danger/energy accents |

**Logo assets (already on disk):**
- `GOOD-FIGHTS-LOGO-WORDS-AND-HAND.png` — vertical lockup, transparent → **outro hero + intro stinger**.
- `adaptive-icon-foreground.png` (gold hand on dark) / hand-only PNG → **persistent corner watermark**. *(If watermark sits on changing imagery, prep a true-transparent hand PNG so the dark square doesn't show — quick edit.)*
- `Good-Fights-Splash-Screen.png` — angled wordmark on dark → alt lower-third / title card.
- Mike can re-lockup the wordmark *beside* the hand for a horizontal variant when a frame needs it.

**Fonts (install the .ttf so OpenShot's Title editor sees them):**
- **Display / rating numbers / "#5" ranks:** `Anton` (free, Google Fonts) — heavy condensed, reads great muted. Apply **Shear X ≈ -0.08** (restrained slant) to echo the wordmark.
- **Fighter names / headlines:** `Anton` or `Montserrat ExtraBold`.
- **Captions / body / vote counts:** `Inter` or `Montserrat SemiBold`.
- **The wordmark is always the PNG asset, never re-typed** (its font is an AI-gen frankenfont — unrecoverable, and we don't need it). For a big *static* hero headline where you want the exact wordmark texture, generate a matching-style PNG (ChatGPT, same as the wordmark) instead of setting type. All *animated* text uses Anton.

### 9.1 Project settings
- **Profile:** custom **1080×1920, 9:16 vertical.** (Edit → Profile, pick a 1080p vertical profile or make one.)
- **FPS:** **30** default. Bump to **60** only if data animations feel choppy (heavier export). — *taste call, see end of session.*
- **Sample rate:** 48000 Hz stereo.
- Length target: **60–75s** (§3 beats).

### 9.2 Safe zones (TikTok / Shorts / Reels UI eats the edges)
Keep all critical text/numbers inside the center column:
- **Bottom ~420px:** caption + handle + "more" — keep nothing important here except burned-in captions you control.
- **Right ~140px:** like/comment/share rail — keep numbers off the right edge.
- **Top ~120px:** clock/back. Watermark lives just below this, top-LEFT (right is covered on some apps).
> Build a faint guide: one Title clip with a centered rectangle outline on a muted track, eyeball-only, deleted before export. Or just respect the margins by habit.

### 9.3 Track architecture (top track = renders on top)
| Track | Content |
|---|---|
| **T7** | Watermark (hand bug, top-left) + final CTA hero logo |
| **T6** | Captions (burned-in subtitle titles) |
| **T5** | **Rating number** + glow halo (the star) |
| **T4** | Data overlay — rating bar, vote count, "#5" rank ghost |
| **T3** | Fighter names / matchup / event text |
| **T2** | Fighter headshots / imagery |
| **T1** | Background (base `#181818` + optional subtle moving grain/particle loop) |
| **A1** | Voiceover (ElevenLabs) — the master sync track |
| **A2** | Music bed |
| **A3** | SFX (ticks, whooshes, swell) |

### 9.4 The 5 signature elements (build each ONCE, copy-paste forever)

**① Number Pop** *(the signature beat — every rating number does this)*
Title clip, Anton, gold `#F5C518`, Shear X -0.08. Keyframes (@30fps, Bézier interp — restrained):
- f0: Scale 0.6, Alpha 0
- f5 (~0.17s): Alpha 1.0
- f9 (~0.30s): Scale **1.10** (gentle overshoot)
- f14 (~0.47s): Scale 1.0 (settle)
- **Glow halo:** duplicate the number clip onto T4 *below*, apply **Blur** effect (H/V radius ~8), Scale +5%, same gold → soft halo. (OpenShot has no native Glow; this is the trick.)
- Sync a **"thock/tick" SFX** to the f7 overshoot peak.

**② Blur Reveal** *(hook cold-open + the #1 payoff)*
Number title clip + **Blur** effect. Keyframe Blur H-radius & V-radius:
- Held high (~20) while teased →
- at reveal moment ramp **20 → 0 over ~0.4s**, simultaneously run the Number Pop scale. Pair with a rising **swell SFX**. This is the retention engine (§3) — do not cut it.

**③ Rating Bar fill** *(data-viz, cheap + premium)*
A thin gold rectangle (Title or a solid color clip), **Origin X = 0** (anchor left), placed under the number. Keyframe **Scale X 0 → target** (target = rating/10, e.g. 9.76 → 0.976) over ~0.5s, eased. Reads as the score "filling up." Optional faint `#202020` track behind it as the 100% rail.

**④ Card Transition — the "whoosh slide"** *(use the SAME one everywhere = pro consistency)*
Between countdown cards, **~12 frames (~0.4s, restrained)**, overlapping:
- Outgoing group: Location X 0 → **-1.0**, Alpha 1 → 0
- Incoming group: Location X **1.0** → 0, Alpha 0 → 1
- Add a **whoosh SFX** on the cut. (Alternative: a single tinted wipe from the Transitions tab — but keyframed slide looks more premium and you control the speed. Pick one and never mix.)

**⑤ Watermark bug**
Hand PNG, ~110px, top-left inside safe zone, **Alpha 0.6**, present on **every clip except the outro** (where the full lockup takes over). Keeps the brand on the frame if a clip gets re-shared.

### 9.5 Beat-by-beat build (maps to §3 table)
| Beat | Time | Build |
|---|---|---|
| **Hook** | 0–3s | BG up. Watermark in. Headline Title ("Thousands rated every UFC fight…") slides up (Location Y .15→0, Alpha 0→1). Center the **#1 number BLURRED** (Element ②, held blurred). Swell starts. |
| **Tease** | 3–7s | 5 headshots flash in fast (each ~0.4s, quick Scale 0.9→1 + Alpha pop), small rank ghost behind each. "The 5 greatest — counting down." |
| **Countdown** | 7–60s | One card per fight, ~10s. Per card: headshots slide in (Element ④ direction), names (T3) type/slide, event in gray, **rating bar fills** (③), **number pops** (①) synced to the spoken number, one visceral caption line (T6). Whoosh (④) to next. |
| **Payoff #1** | 60–70s | Slow down — give it air. Hold black/BG beat (~0.5s), then **un-blur the #1** (Element ②) + biggest Number Pop + swell peak. Let it sit 2s. |
| **CTA** | 70–75s | `GOOD-FIGHTS-LOGO-WORDS-AND-HAND.png` hero scales in center (Scale 0.7→1, ease). Tagline Title: **"Never miss a Good Fight."** + "Rate them yourself · Search Good Fights" + @handle. Hold 3s. |

### 9.6 Motion principles (what makes it read "pro" not "amateur")
- **One easing everywhere:** Bézier (ease-in-out) on every keyframe. Linear motion looks robotic.
- **Gentle overshoot on entrances** (the 1.10 settle) — gives life without looking hyper. Never let text just *appear*.
- **Consistency > variety:** ONE transition, ONE number animation, ONE font system. Reuse is the look.
- **Nothing static >2s:** even held cards get a slow 1.0→1.03 drift (Ken Burns) so the frame breathes.
- **Cut on the beat:** align whooshes/pops to the VO and music — sync is 80% of perceived quality.

### 9.7 Audio map (see §5 for tooling)
- **A1 VO** is the master — lay it first, build visuals to it.
- **A3 SFX (restrained — don't over-sauce):** `thock` on each number pop + one big `swell` rising into the #1 reveal. Transitions get a *soft* low whoosh at most (or silence) — sparse SFX is what makes it feel premium, not hype-bro.
- **A2 music:** energy bed under VO, swell on #1. TikTok trending sound added **in-app after export**; YouTube uses a licensed library track.

### 9.8 Export settings
- Target: **MP4 / H.264**, 1080×1920, same fps as project, **High** quality / bitrate ~12–16 Mbps.
- Export **clean** (no captions baked) for the TikTok-in-app-caption route, OR with burned captions for YouTube — decide per the §4 caption decision.
- Name: `GF_<format>_<topic>_v1.mp4`.

### 9.9 First-build order (do it in this sequence)
1. Set project profile (9.1) + install fonts (9.0). 2. Build T1 background + watermark (⑤). 3. Build the 5 reusable elements (9.4) on a scratch timeline, get each perfect, then save the project as the template. 4. Lay VO (A1). 5. Build Hook → CTA against the VO. 6. Add SFX + music. 7. Export. 8. Post-mortem: note what to bake back into the template.

### 9.10 Asset-prep TODO (before first cut)
- [ ] Install `Anton` + `Inter`/`Montserrat` .ttf (system-wide so OpenShot sees them).
- [ ] Prep a **true-transparent hand PNG** for the watermark (current ones sit on dark squares).
- [ ] Export the **top-5 fighter headshots** from R2 (consistent crop, ~600px tall).
- [ ] Grab SFX: tick/thock, whoosh, swell (YouTube Audio Library / freesound, licensed).
- [ ] Confirm bio-link + UTM for the CTA (`utm-conventions.md`).

---

## Session Log
- **2026-06-03** — Designed the full OpenShot template build spec (§9): brand kit locked to app tokens (gold `#F5C518`/`#181818`), font system (Anton + Inter, sheared to match wordmark), 7-track architecture, the 5 reusable signature elements (number pop, blur reveal, rating-bar fill, whoosh transition, watermark bug) with exact keyframes, beat-by-beat build, motion/audio principles, export + first-build order. Identified real logo assets (`GOOD-FIGHTS-LOGO-WORDS-AND-HAND.png` lockup for outro, hand for watermark). Next: Mike builds the shell in OpenShot; open taste calls = fps, number font, true-counter vs pop.
- **2026-06-02** — Kickoff brainstorm. Set evergreen-first strategy + data-overlay moat. Defined the 5-beat countdown template. Adapted look/sound guidance to OpenShot (captions flagged as the gap). Pulled video #1 data (top 5 UFC fights) via new `scripts/top-ufc-fights.js`; wrote the ≈120-word voiceover script. Next: build the OpenShot template shell.
