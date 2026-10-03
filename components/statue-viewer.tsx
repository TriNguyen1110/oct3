"use client";

import { useEffect, useRef, useState } from "react";

/** Adapted from UI Layout's MIT R3F Blob, featured on 21st.dev.
 * Classic Perlin displacement is retained; renderer, polished material,
 * cinematic rings and on-demand interaction are customized for Cue.
 * See statue-viewer.LICENSE.txt for source and license. */
const blobNoise = `vec4 permute(vec4 x) {
    return mod(((x*34.0)+1.0)*x, 289.0);
}

vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

vec3 fade(vec3 t) {
    return t*t*t*(t*(t*6.0-15.0)+10.0);
}

float cnoise(vec3 P) {
    vec3 Pi0 = floor(P);
    vec3 Pi1 = Pi0 + vec3(1.0);
    Pi0 = mod(Pi0, 289.0);
    Pi1 = mod(Pi1, 289.0);
    vec3 Pf0 = fract(P);
    vec3 Pf1 = Pf0 - vec3(1.0);
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = Pi0.zzzz;
    vec4 iz1 = Pi1.zzzz;

    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);

    vec4 gx0 = ixy0 / 7.0;
    vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(0.0, gx0) - 0.5);
    gy0 -= sz0 * (step(0.0, gy0) - 0.5);

    vec4 gx1 = ixy1 / 7.0;
    vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1 * (step(0.0, gx1) - 0.5);
    gy1 -= sz1 * (step(0.0, gy1) - 0.5);

    vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
    vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
    vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
    vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
    vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
    vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
    vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
    vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

    vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
    g000 *= norm0.x;
    g010 *= norm0.y;
    g100 *= norm0.z;
    g110 *= norm0.w;
    vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
    g001 *= norm1.x;
    g011 *= norm1.y;
    g101 *= norm1.z;
    g111 *= norm1.w;

    float n000 = dot(g000, Pf0);
    float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
    float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
    float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
    float n111 = dot(g111, Pf1);

    vec3 fade_xyz = fade(Pf0);
    vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
    return 2.2 * n_xyz;
}

`;

export function StatueViewer() {
  const host = useRef<HTMLDivElement>(null);
  const turn = useRef<(delta: number, reset?: boolean) => void>(() => {});
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let cancelled = false;
    let dispose = () => {};
    let scheduled: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      scheduled = setTimeout(() => { void start(); }, 350);
    }, { rootMargin: "120px" });
    observer.observe(element);

    async function start() {
      try {
        const [THREE, { RoomEnvironment }] = await Promise.all([import("three"), import("three/examples/jsm/environments/RoomEnvironment.js")]);
        if (cancelled) return;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        renderer.setClearColor(0x141211, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1, .1, 30);
        camera.position.set(0, .1, 5.8);
        camera.lookAt(0, 0, 0);
        const group = new THREE.Group();
        group.rotation.y = -.18;
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        const environment = pmrem.fromScene(room, .04);
        scene.environment = environment.texture;
        room.dispose(); pmrem.dispose();
        const material = new THREE.MeshPhysicalMaterial({ color: 0xbfa16c, metalness: 1, roughness: .25, clearcoat: .65, clearcoatRoughness: .18, envMapIntensity: 1.2 });
        material.onBeforeCompile = shader => {
          const displacement = blobNoise + `
            vec3 cueDisplace(vec3 p) { return p + normalize(p) * (0.1 * cnoise(p * 1.8 + vec3(0.5, 0.2, 1.2))); }
          `;
          shader.vertexShader = displacement + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = cueDisplace(position);');
          shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
            vec3 cueN = normalize(normal);
            vec3 cueT = normalize(cross(cueN, abs(cueN.y) < 0.9 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0)));
            vec3 cueB = normalize(cross(cueN, cueT));
            vec3 objectNormal = normalize(cross(cueDisplace(position+cueT*0.01)-cueDisplace(position-cueT*0.01),cueDisplace(position+cueB*0.01)-cueDisplace(position-cueB*0.01)));
          `);
        };
        const model = new THREE.Group();
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.04, 28), material);
        core.rotation.set(.2, .3, -.12); model.add(core);
        const ringMaterial = new THREE.MeshStandardMaterial({color:0xc9b58d,metalness:.85,roughness:.3,envMapIntensity:1.4});
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.53,.013,12,180),ringMaterial);
        ring.rotation.set(1.12,.2,-.42);model.add(ring);
        const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.7,.006,8,180),ringMaterial);
        orbit.rotation.set(.25,1.03,.3);model.add(orbit);
        const satelliteMaterial = new THREE.MeshPhysicalMaterial({color:0x6cafa0,metalness:.65,roughness:.2,clearcoat:1});
        const satellite = new THREE.Mesh(new THREE.SphereGeometry(.105,24,16),satelliteMaterial);
        satellite.position.set(-1.42,.42,.2);model.add(satellite);
        group.add(model); scene.add(group);
        scene.add(new THREE.HemisphereLight(0xf0e4d1,0x161817,.5));
        const key = new THREE.DirectionalLight(0xffedcf,3);key.position.set(-3,4,5);scene.add(key);
        const rim = new THREE.DirectionalLight(0x83cab6,2);rim.position.set(3,1,-2);scene.add(rim);
        let frame = 0;
        const render = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (!cancelled) renderer.render(scene, camera); }); };
        turn.current = (delta, reset) => { group.rotation.y = reset ? -.18 : THREE.MathUtils.clamp(group.rotation.y + delta, -.8, .8); element!.dataset.rotation = group.rotation.y.toFixed(3); render(); };
        const resize = () => { const { width, height } = element!.getBoundingClientRect(); if (!width || !height) return; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); render(); };
        const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(element!);
        let pointer: number | null = null, previousX = 0;
        const down = (event: PointerEvent) => { pointer = event.pointerId; previousX = event.clientX; renderer.domElement.setPointerCapture(pointer); };
        const move = (event: PointerEvent) => { if (pointer !== event.pointerId) return; turn.current((event.clientX - previousX) * .008); previousX = event.clientX; };
        const up = () => { pointer = null; };
        const lost = (event: Event) => { event.preventDefault(); if (!cancelled) setStatus("fallback"); };
        renderer.domElement.addEventListener("pointerdown", down); renderer.domElement.addEventListener("pointermove", move); renderer.domElement.addEventListener("pointerup", up); renderer.domElement.addEventListener("pointercancel", up); renderer.domElement.addEventListener("webglcontextlost", lost);
        renderer.domElement.setAttribute("aria-hidden", "true");
        element!.appendChild(renderer.domElement); resize();
        element!.dataset.vertices = String(core.geometry.attributes.position.count);
        renderer.render(scene, camera);
        element!.dataset.triangles = String(renderer.info.render.triangles);
        setStatus("ready");
        dispose = () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); renderer.domElement.remove(); model.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); }); material.dispose(); ringMaterial.dispose(); satelliteMaterial.dispose(); environment.dispose(); renderer.dispose(); renderer.forceContextLoss(); };
      } catch { if (!cancelled) setStatus("fallback"); }
    }
    return () => { cancelled = true; controller.abort(); clearTimeout(scheduled); observer.disconnect(); turn.current = () => {}; dispose(); };
  }, []);

  return <figure className={`cue-sculpture cue-model cue-model-state-${status}`}>
    <div className="cue-emblem-fallback" aria-hidden="true"><span/></div>
    <div ref={host} className="cue-model-stage" role="img" aria-label="Interactive sculptural gold Cue emblem" data-status={status}/>
    <figcaption className="cue-model-caption"><span>A QUIET FORCE. BEHIND THE SCENES.</span>
      {status === "ready" ? <div className="cue-model-controls"><button type="button" aria-label="Rotate emblem left" onClick={() => turn.current(-.18)}>←</button><span>DRAG TO EXPLORE</span><button type="button" aria-label="Rotate emblem right" onClick={() => turn.current(.18)}>→</button><button type="button" className="cue-model-reset" onClick={() => turn.current(0, true)}>Reset</button></div> : <span>{status === "loading" ? "" : "STILL PREVIEW"}</span>}
    </figcaption>
  </figure>;
}
