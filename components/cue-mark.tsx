/** Cue: a soft C, open toward the next step. Matches app/icon.svg. */
export function CueMark() {
  return <svg className="cue-mark" width="44" height="44" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="60" height="60" rx="21" fill="currentColor"/>
    <path d="M38 18.5a16 16 0 1 0 0 27" stroke="#24192c" strokeWidth="7" strokeLinecap="round"/>
    <path className="cue-arrow" d="m43 26 6 6-6 6" stroke="#24192c" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
