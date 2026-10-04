const proofs = [
  {
    lane: "LOGISTICS",
    provider: "Amazon",
    title: "3 toothpaste options found",
    command: "Find one single tube of Colgate Cavity Protection toothpaste on Amazon, under $10.",
    result: "Closest match: Colgate Cavity Protection, 1 oz travel size, single tube — $2.99.",
    detail: "Compared three live listings under the budget cap.",
    boundary: "Nothing purchased",
    accent: "gold",
    dashboard: "https://oct3-five.vercel.app/?mission=5ed303b0-64c4-4094-9441-407347cb630d",
    source: "https://www.amazon.com/dp/B01FIL72L0",
  },
  {
    lane: "HIRING",
    provider: "Fiverr",
    title: "3 beat makers compared",
    command: "Find a popular beat maker under $10 for a short, versatile hip-hop instrumental.",
    result: "Recommended: Eira Beats — 4.8 rating from 640 reviews, starting at $10.",
    detail: "Ranked a recommendation and two alternatives with price caveats.",
    boundary: "No seller contacted",
    accent: "rose",
    dashboard: "https://oct3-five.vercel.app/?mission=f35ca2fe-065b-47c9-9b67-fa1a0eac8bcd",
    source: "https://www.fiverr.com/eiramusic/produce-or-remake-any-beats-and-avoid-copyright",
  },
  {
    lane: "FOOD & SUPPLIES",
    provider: "DoorDash",
    title: "Boba found for $6.90",
    command: "Find one Classic Black milk tea from Boba Guys for pickup near 580 20th Street.",
    result: "Classic Black found on the real Boba Guys pickup menu, under the $10 cap.",
    detail: "Returned the menu source and flagged unverified modifiers and fees.",
    boundary: "No cart or order",
    accent: "jade",
    dashboard: "https://oct3-five.vercel.app/?mission=cad0ef12-276d-4ecf-9ec1-3e6e62bdb653",
    source: "https://www.doordash.com/store/boba-guys-san-francisco-880283/?pickup=true",
  },
] as const;

function ExternalArrow() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3h7v7m0-7L10 14M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/></svg>;
}

export function LiveAgentProof() {
  return <section className="proof-wall" aria-labelledby="proof-wall-title">
    <div className="proof-wall-heading">
      <div>
        <span className="proof-kicker"><i/>CAPTURED LIVE IN CLAUDE CODE</span>
        <h2 id="proof-wall-title">The brief goes in.<br/><em>Grounded work comes back.</em></h2>
      </div>
      <p>Claude delegates through Cue. Independent browser workers research real providers, compare options, and return a review link with explicit boundaries.</p>
    </div>

    <div className="proof-grid">
      {proofs.map((proof, index) => <article className={`proof-card proof-${proof.accent}`} key={proof.provider}>
        <div className="proof-card-chrome">
          <div className="proof-lights"><i/><i/><i/></div>
          <span>cue / {proof.provider.toLowerCase()}</span>
          <b>0{index + 1}</b>
        </div>
        <div className="proof-card-body">
          <div className="proof-meta"><span>{proof.lane}</span><span className="proof-provider"><i/>{proof.provider}</span></div>
          <p className="proof-command"><span>›</span>{proof.command}</p>
          <div className="proof-called"><i/> Called oct3</div>
          <h3>{proof.title}</h3>
          <p className="proof-result">{proof.result}</p>
          <p className="proof-detail">{proof.detail}</p>
        </div>
        <div className="proof-card-footer">
          <span className="proof-boundary"><i/>{proof.boundary}</span>
          <div>
            <a href={proof.dashboard} target="_blank" rel="noopener noreferrer">Open mission<ExternalArrow/></a>
            <a href={proof.source} target="_blank" rel="noopener noreferrer">Source<ExternalArrow/></a>
          </div>
        </div>
      </article>)}
    </div>

    <div className="proof-footnote"><span>3</span> real provider surfaces <i/> <span>3</span> parallel lanes <i/> <span>0</span> unintended commitments</div>
  </section>;
}
