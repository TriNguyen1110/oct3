# Voice draft and cinematic hero verification

Independent bounded verification on 2026-10-03 in canonical oct3 workspace. No real microphone, Gemini call, Supabase write, mission submission, approval, or merchant action. Every app API and provider interaction in these checks is mocked. No broad suite rerun.

## Voice

`tests/voice.test.ts`: **5 reported checks passed**. Canonical PCM16 mono 16kHz WAV validation accepts 1/20 seconds, rejects short/oversize/silent audio and independently damaged format/header fields. Route rejects unauthenticated/agent/wrong-or-missing-origin callers, extra multipart fields and both advertised/streamed body limits before provider access. Mock provider timeout, denial, invalid schema, invalid audio and silence release the scoped lease; errors hide synthetic credentials. A concurrent request returns 429; success is draft-only, no-store and invokes no action tools.

`OCT3_VOICE_UI_URL=http://localhost:3003 node --import tsx --test tests/voice-ui.test.ts`: **5 reported checks passed**, 3.798 seconds. A synthetic microphone/MediaRecorder supplies `tests/fixtures/voice-brief.wav` (bundled nonpersonal synthetic speech, resolved relative to the test module); actual Chrome AudioContext/OfflineAudioContext decoding and conversion produce a server-valid 4.842-second WAV. No microphone request occurs before clicking Record. Draft review leaves form unchanged until Use; Use changes objective and preserves all other inputs for null budget/food. Source review confirms non-null budget/food merge only those fields. Late permission after cancellation stops its tracks without upload; 20-second auto-stop processes the recording; provider failure and 35-second timeout restore form controls; closing during recording stops tracks without upload. No mission/approval API calls or page errors.

`npm run typecheck`: exit 0 after voice tests. Initial browser harness failures were corrected authentication-readiness waits, exact selectors and the transpiler helper required by injected synthetic classes; no feature fixes were made by verifier. The negative provider-timeout test injects timeout failure; the browser timeout uses an accelerated clock. This does not establish real microphone permission UX or real Gemini availability. Root owns actual provider proof.

Voice source snapshot:
- `src/server/voice.ts`: f3bc80f3ea3b87c8d2240df222cee4965a16ecdcbc6347c4da4b27bd7b21e79c (root changed only thinking level minimal→low after mocked checks; provider compatibility proof owned separately by root)
- `app/api/voice/draft/route.ts`: 0946067203fcdf36edecc804cbba3de77a00ae2904b9b9205240bfb7ea7084da
- `src/shared/voice.ts`: 74a6f02b13c66950b7d350b5363fec024b71aa864bcb2d5640515c21ba185f49
- `components/voice-brief.tsx`: 1dc3450474f1dc388c557f12bfe2a744574dd40c6357925e607f98edc6965e51
- `src/client/voice-audio.ts`: 1f1a3ba2930d66031223eabfc799f8aa1c81f4e22f662075919cadd3e238fee9

## Hero

Updated existing `tests/visual-refinement-ui.test.ts` obsolete H1 and hero selector. Ran only `--test-name-pattern='final four-worker'`: **3 reported checks passed**, 4.445 seconds. At 1440/390, authenticated mocked fixture renders four worker cards, the new heading, decoded raster hero image, level hero transform, reduced-motion image/shape animation disabled, no horizontal overflow/page errors, New mission opens the form, boba pickup defaults remain. Zero API mutations. Inspected `/tmp/cue-cinematic-independent-1440.png` and `-390.png`. Artwork is a raster render with CSS, not WebGL.

Frozen hero SHA256: `components/cinematic-hero.tsx` 999162f6c34c5cae925d98cc62927d255fc039777f381b94a386ed278ea7fe28; `app/globals.css` f295f9b569df507aa4a72d07d0899ff97dab19cd6570aa5b96759738c1d22658.

Portability follow-up: the synthetic recording is committed as a test fixture rather than requiring a scratch file. Actual Gemini proof remains blocked by provider paid-credit requirements, per coordinator; mocked verification does not establish provider availability.

Portable-fixture rerun: voice UI 5/5 passed, 4.186 seconds; diff check passed. Fixture SHA256 `05b2916bc535c86c7fcef156f48536680750a4ccdc4dc4ef131ddf796469cd2d`.

Readiness update: coordinator actual Gemini evidence at21:07:50Z now records HTTP200 and a valid synthetic-audio draft in2088ms, superseding the earlier provider-credit blocker. See `../performance/gemini-voice-proof.json`; this remains separate from the mocked tests above.
