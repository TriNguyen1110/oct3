"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/** Real SMK public-domain sculpture scan; rendered on demand, never a textured plane. */
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
        const [THREE, { GLTFLoader }] = await Promise.all([import("three"), import("three/examples/jsm/loaders/GLTFLoader.js")]);
        if (cancelled) return;
        const response = await fetch("/models/cue-apollo.glb", { signal: controller.signal });
        if (!response.ok) throw new Error("Model unavailable");
        const bytes = await response.arrayBuffer();
        const gltf = await new GLTFLoader().parseAsync(bytes, "");
        if (cancelled) return;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        renderer.setClearColor(0x141211, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1, .1, 30);
        camera.position.set(0, .6, 3.5);
        camera.lookAt(0, .6, 0);
        const group = new THREE.Group();
        group.rotation.y = -.18;
        const model = gltf.scene;
        const material = new THREE.MeshStandardMaterial({ color: 0xd0cec5, roughness: .78, metalness: .02 });
        model.traverse(object => { if (object instanceof THREE.Mesh) { object.material = material; object.geometry.computeVertexNormals(); } });
        group.add(model); scene.add(group);
        scene.add(new THREE.HemisphereLight(0xe8e2d4, 0x28231f, .55));
        const key = new THREE.DirectionalLight(0xffe9cd, 2.5); key.position.set(-3, 4, 5); scene.add(key);
        const rim = new THREE.DirectionalLight(0x8ec9bf, .9); rim.position.set(3, 1, -2); scene.add(rim);
        const fill = new THREE.DirectionalLight(0xffffff, .18); fill.position.set(2, 0, 4); scene.add(fill);
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
        element!.dataset.vertices = String((model.children[0] as import("three").Mesh)?.geometry?.attributes.position.count ?? 0);
        renderer.render(scene, camera);
        element!.dataset.triangles = String(renderer.info.render.triangles);
        setStatus("ready");
        dispose = () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); renderer.domElement.remove(); model.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); }); material.dispose(); renderer.dispose(); renderer.forceContextLoss(); };
      } catch { if (!cancelled) setStatus("fallback"); }
    }
    return () => { cancelled = true; controller.abort(); clearTimeout(scheduled); observer.disconnect(); turn.current = () => {}; dispose(); };
  }, []);

  return <figure className={`cue-sculpture cue-model cue-model-state-${status}`}>
    <Image src="/models/cue-apollo-preview.jpg" width={1024} height={1024} alt={status === "ready" ? "" : "Apollo Lykeios bust from SMK’s public-domain collection"} priority sizes="(max-width:590px) 390px,640px" className="cue-model-fallback"/>
    <div ref={host} className="cue-model-stage" role="img" aria-label="Interactive 3D scan of the Apollo Lykeios bust" data-status={status}/>
    <figcaption className="cue-model-caption"><span>APOLLO LYKEIOS · <a href="https://open.smk.dk/artwork/image/KAS607" target="_blank" rel="noreferrer">SMK · PUBLIC DOMAIN</a></span>
      {status === "ready" ? <div className="cue-model-controls"><button type="button" aria-label="Rotate statue left" onClick={() => turn.current(-.18)}>←</button><span>3D SCAN · DRAG TO EXPLORE</span><button type="button" aria-label="Rotate statue right" onClick={() => turn.current(.18)}>→</button><button type="button" className="cue-model-reset" onClick={() => turn.current(0, true)}>Reset</button></div> : <span>{status === "loading" ? "LOADING 3D SCAN" : "STILL PREVIEW · 3D UNAVAILABLE"}</span>}
    </figcaption>
  </figure>;
}
