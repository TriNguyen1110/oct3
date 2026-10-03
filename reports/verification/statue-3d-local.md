# Real 3D classical hero verification

Uses the actual SMK KAS607 Apollo Lykeios scan, public domain per museum metadata and linked provenance in public/models/cue-apollo.source.txt. Source STL had399996 triangles; local quadric reduction/export produced65000 triangles,32502 vertices and a1170804-byte GLB. Geometry is drawn with Three.js, not an image plane. Museum preview photo appears only during load/WebGL failure.

Fresh headless Chrome with software WebGL rendered the actual canvas at1440 and390px. Screenshots /tmp/cue-3d-1440.png and /tmp/cue-3d-390.png were visually inspected. Face remains visible; no page overflow/errors. Drag changed mesh rotation; accessible rotation and reset buttons worked. New mission opened its dialog. All rendering is on demand; no autonomous animation, including reduced-motion mode.

Separate390px DPR3 run rendered65000 triangles with fallback hidden and effectiveDPR capped1.5. Local navigation-to-ready1218ms; GLB resource73ms,1170804 decoded bytes,832128 transfer bytes. These are single local software-renderer observations, not production or real-user performance metrics. Forced WebGL-unavailable case displayed honest still-preview fallback, no overflow, and working mission CTA. Typecheck passed.

Machine-readable limits: reports/performance/statue-3d-local.json. No auth, provider, purchase, enrollment or mission writes were used in these checks.
