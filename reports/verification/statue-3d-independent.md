# Independent 3D hero verification

Verified 2026-10-03 against the frozen local files and `http://localhost:3003` in an isolated headless Chromium process with no persistent or native Chrome profile.

- `components/statue-viewer.tsx` SHA256 `047eb96a34bc05b33e77f399e96b4bffd3363741c96a69437ad9f8b40f47cdca`
- `components/cinematic-hero.tsx` SHA256 `81b83eea61763d2a61c4b45ac31ecf8e8b2a18b2d53f383b4e544727c46aa385`
- At 1440×1000 and 390×844 DPR3, the canvas reached `ready` and reported 65,000 rendered triangles and 32,502 vertices. There were no page errors or horizontal overflow.
- Pointer drag changed the rotation readback on both viewports. Reset returned it to `-0.180` radians.
- The New mission CTA stayed visible and opened the mission dialog on both viewports.
- Aborting only the GLB request moved the component to its explicit `fallback` state, exposed “STILL PREVIEW · 3D UNAVAILABLE,” kept the still preview and CTA visible, and caused no horizontal overflow.

The fallback check establishes model-load failure behavior rather than every possible WebGL failure. These are local software-renderer observations, not production performance or real-user metrics. No authentication, provider, mission, merchant, browser-profile or other external action occurred.
