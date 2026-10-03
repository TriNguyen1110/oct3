"use client";

import Image from "next/image";
import type { CSSProperties } from "react";

/**
 * Floating geometric light layers adapted from Kokonut UI Shape Hero by
 * @dorianbaffier, Copyright (c) 2025 kokonutUI (MIT).
 * https://21st.dev/@kokonutd/components/shape-landing-hero
 * https://github.com/kokonut-labs/kokonutui/blob/main/components/kokonutui/shape-hero.tsx
 * License retained in cinematic-hero.LICENSE.txt. Motion ported to CSS;
 * the original generated statue, Cue composition and interactions are project-specific.
 */
function ElegantShape({ className, width, height, delay = 0 }: { className: string; width: number; height: number; delay?: number }) {
  return <div className={`cue-elegant-shape ${className}`} style={{ "--shape-delay": `${delay}s` } as CSSProperties}>
    <div className="cue-shape-float" style={{ width, height }}><div className="cue-shape-surface"/></div>
  </div>;
}

export function CinematicHero({ onNewMission, onConnect }: { onNewMission: () => void; onConnect: () => void }) {
  return <section className="cinematic-hero" aria-labelledby="cue-hero-title">
    <div className="cue-hero-atmosphere" aria-hidden="true">
      <ElegantShape className="cue-shape-gold" width={440} height={110} delay={0.2}/>
      <ElegantShape className="cue-shape-glass" width={300} height={80} delay={0.6}/>
    </div>
    <div className="cue-hero-copy">
      <p className="eyebrow"><span/> YOUR AGENT’S EXTRA HANDS</p>
      <h1 id="cue-hero-title">Hands free.<br/><em>In good hands.</em></h1>
      <p className="cue-hero-description">Your agent has a plan.<br/>Cue brings the extra hands.</p>
      <div className="cue-hero-actions"><button className="button primary" onClick={onNewMission}><span aria-hidden="true">+</span>New mission<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></button><button className="cue-hero-secondary" onClick={onConnect}>Connect your agent<span aria-hidden="true">↗</span></button></div>
      <p className="cue-hero-assurance"><svg width="14" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/></svg>Every commitment is still your call.</p>
    </div>
    <div className="cue-sculpture" aria-hidden="true">
      <div className="cue-deco-arch"/>
      <div className="cue-sculpture-light"/>
      <Image src="/images/cue-concierge-gold.png" width={1254} height={1254} alt="" priority sizes="(max-width: 590px) 300px, (max-width: 800px) 420px, 600px" className="cue-sculpture-image"/>
      <div className="cue-sculpture-caption"><span/> THE CUE CONCIERGE <span/></div>
    </div>
  </section>;
}
