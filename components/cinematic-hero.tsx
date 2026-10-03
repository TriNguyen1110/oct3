"use client";

import Image from "next/image";
// Real marble photography from The Metropolitan Museum of Art (public domain).
// Provenance: public/images/cue-hermes-marble.source.txt.

export function CinematicHero({ onNewMission, onConnect }: { onNewMission: () => void; onConnect: () => void }) {
  return <section className="cinematic-hero" aria-labelledby="cue-hero-title">
    <div className="cue-hero-copy">
      <p className="eyebrow"><span/> YOUR AGENT’S EXTRA HANDS</p>
      <h1 id="cue-hero-title">Hands free.<br/><em>In good hands.</em></h1>
      <p className="cue-hero-description">Your agent has a plan.<br/>Cue brings the extra hands.</p>
      <div className="cue-hero-actions"><button className="button primary" onClick={onNewMission}><span aria-hidden="true">+</span>New mission<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></button><button className="cue-hero-secondary" onClick={onConnect}>Connect your agent<span aria-hidden="true">↗</span></button></div>
      <p className="cue-hero-assurance"><svg width="14" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/></svg>Every commitment is still your call.</p>
    </div>
    <div className="cue-sculpture" aria-hidden="true">
      <Image src="/images/cue-hermes-marble.jpg" width={2882} height={3842} alt="" priority sizes="(max-width: 590px) 390px, (max-width: 800px) 420px, 640px" className="cue-sculpture-image"/>
      <div className="cue-sculpture-caption">HERMES <span/> THE MET COLLECTION</div>
    </div>
  </section>;
}
