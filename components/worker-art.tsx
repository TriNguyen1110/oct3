import type { Lane } from "@/src/shared/contracts";

/** Original miniature desk objects; decorative, never evidence of a result. */
export function WorkerArt({ lane }: { lane: Lane }) {
  return <div className={`worker-art ${lane}`} aria-hidden="true"><div className="art-orbit"/><svg viewBox="0 0 320 180" fill="none" className="desk-object">
    <defs><linearGradient id={`paper-${lane}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f8e4c5"/><stop offset="1" stopColor="#bba184"/></linearGradient><linearGradient id={`dark-${lane}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#42594f"/><stop offset="1" stopColor="#172d28"/></linearGradient><filter id={`shadow-${lane}`} x="-50%" y="-50%" width="200%" height="220%"><feDropShadow dx="0" dy="14" stdDeviation="9" floodOpacity=".38"/></filter></defs>
    {lane === "amazon" ? <g filter={`url(#shadow-${lane})`}>
      <path d="m67 67 66-33 74 35-65 35-75-37Z" fill="#d9b991"/><path d="M67 67v64l75 37v-64L67 67Z" fill="#aa8360"/><path d="m142 104 65-35v64l-65 35v-64Z" fill="#78543e"/><path d="m94 53 75 37v25l17-9V82l-75-37" fill="#f3dfbd"/><path d="m84 112 36 18v15l-36-18Z" fill="#eed9b9"/><path d="m90 121 3 1m3 2 3 1m3 2 4 2m3 1 4 2" stroke="#755640" strokeWidth="3"/>
      <g transform="rotate(10 222 57)"><rect x="187" y="24" width="57" height="82" rx="7" fill={`url(#dark-${lane})`} stroke="#a6c7b9" strokeOpacity=".5"/><path d="M201 41h26m-26 7h17" stroke="#c4d7c9" strokeWidth="2"/><circle cx="215" cy="73" r="13" stroke="#b4d7c3"/><path d="m209 73 4 4 8-9" stroke="#c4e6d4" strokeWidth="2"/></g>
    </g> : lane === "fiverr" ? <g filter={`url(#shadow-${lane})`}>
      <g transform="rotate(12 174 91)"><rect x="116" y="22" width="116" height="140" rx="9" fill="#4b292d" stroke="#ad7d75"/><path d="M134 43h60m-60 7h39" stroke="#dbbba3"/><circle cx="175" cy="100" r="31" fill="#ad7d75"/><path d="m159 116 31-31" stroke="#f7dbc1" strokeWidth="16"/></g>
      <g transform="rotate(-12 131 88)"><rect x="66" y="15" width="116" height="144" rx="9" fill={`url(#paper-${lane})`}/><path d="M82 35h54m-54 7h34" stroke="#755d49" strokeWidth="2"/><circle cx="127" cy="91" r="32" fill="#2a4b41"/><path d="m107 105 20-38 20 38h-40Z" fill="#c5d9b5"/><path d="M84 138h37m8 0h34" stroke="#876c54"/></g>
      <path d="m231 49 7 4-40 85-10 11 1-16 42-84Z" fill="#cfb482" stroke="#f5dfae"/>
    </g> : <g filter={`url(#shadow-${lane})`}>
      <g transform="rotate(10 164 92)"><rect x="65" y="49" width="206" height="101" rx="12" fill={`url(#dark-${lane})`} stroke="#8ba79a"/><path d="M88 69h78m-78 8h44" stroke="#afc3b1"/></g>
      <g transform="rotate(-9 153 88)"><path d="M49 35h207v34a12 12 0 0 0 0 24v39H49V93a12 12 0 0 0 0-24V35Z" fill={`url(#paper-${lane})`}/><path d="M204 35v97" stroke="#927b60" strokeDasharray="3 5"/><text x="69" y="60" fill="#6f5844" fontSize="9" letterSpacing="3">A LITTLE FURTHER</text><text x="68" y="99" fill="#2d3026" fontSize="34" fontFamily="Georgia,serif" fontStyle="italic">Let's go.</text><path d="M71 116h75" stroke="#8b7054"/><path d="M220 52v62m5-62v62m7-62v62m4-62v62m5-62v62" stroke="#554e3d" strokeWidth="2"/></g>
    </g>}
  </svg><span className="art-caption">{lane === "amazon" ? "THE RIGHT THINGS." : lane === "fiverr" ? "THE RIGHT PEOPLE." : "THE RIGHT PLACES."}</span></div>;
}
