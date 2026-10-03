# Cinematic 21st component adaptation

Replaced the raw Apollo scan with a polished gold displaced icosahedron, fine orbital rings and a sea-glass satellite. Real Three.js geometry; no celebrity or statue face. Adapted classic Perlin shader displacement from UI Layout’s R3F Blob, listed in21st’s3Dcollection. Actual source read: https://www.ui-layouts.com/r/r3f-blob.json . MIT license verified at https://raw.githubusercontent.com/ui-layouts/uilayouts/main/LICENSE and retained in components/statue-viewer.LICENSE.txt. Source is adapted, not installed through21stregistry or claimed unchanged. Custom renderer, normal calculation, material, rings, local studio environment and accessible interactions. No R3F/newdependencies/remoteHDRI/modeldownloads.

Fresh local headless Chromium softwareWebGL: actual canvas at1440/390; screenshots /tmp/cue-emblem-1440.png and /tmp/cue-emblem-390.png visually inspected. Drag, rotatebuttons, reset and missionCTA pass; no overflow/page errors. Local complete check2230/1911ms respectively. SeparateDPR3/reducedmotion run: ready1230ms,24740drawntriangles,50460corevertices, effectiveDPR1.5, fallbackhidden, noautomaticrotation. NoGLB/HDR/STLrequests. ForcedWebGLfailure displays staticCSSemblem andworkingCTA withoutoverflow. These are singlelocalsoftware-renderer observations, not production/real-user metrics. Typecheckpassed.

Sources and license:
- https://docs.21st.dev/community/components/s/3d
- https://www.ui-layouts.com/r/r3f-blob.json
- https://raw.githubusercontent.com/ui-layouts/uilayouts/main/LICENSE

Machine evidence: reports/performance/emblem-3d-local.json.
