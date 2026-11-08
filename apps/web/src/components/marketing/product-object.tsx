import { useId } from 'react'
import { ProductGlyph, type GlyphKind } from './product-glyph'

/** Product illustrations, shared by the large catalogue and its closing scene. */
export function ProductObject({ kind, className }: { kind: GlyphKind; className?: string }) {
  const id = useId().replaceAll(':', '')
  if (!['drill', 'driver', 'bits', 'level'].includes(kind)) return <ProductGlyph kind={kind} className={className} />
  const metal = `url(#${id}-metal)`
  const body = `url(#${id}-body)`
  const dark = `url(#${id}-dark)`
  return <svg viewBox="0 0 200 140" fill="none" className={className} aria-hidden>
    <defs>
      <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#e3e3dd" /><stop offset=".45" stopColor="#9fa5a0" /><stop offset="1" stopColor="#68736c" /></linearGradient>
      <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={kind === 'drill' ? '#dab477' : '#79957b'} /><stop offset="1" stopColor={kind === 'drill' ? '#af7940' : '#3d5b46'} /></linearGradient>
      <linearGradient id={`${id}-dark`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#49504b" /><stop offset="1" stopColor="#252e28" /></linearGradient>
      <radialGradient id={`${id}-shadow`}><stop stopColor="#26392c" stopOpacity=".18" /><stop offset="1" stopColor="#26392c" stopOpacity="0" /></radialGradient>
    </defs>
    <ellipse cx="103" cy="121" rx="70" ry="10" fill={`url(#${id}-shadow)`} />
    {kind === 'driver' && <g transform="translate(34 8) rotate(-10 66 62)">
      <path d="m69 55 18 1-8 44-22-2z" fill={dark} />
      <path d="m69 55 7 1-7 35-9-1z" fill="#6b856e" />
      <path d="M56 95h31l5 11-3 9H51l-2-9z" fill={dark} stroke="#29382d" />
      <path d="M55 100h29v6H55z" fill="#6a836b" /><path d="M61 110h18" stroke="#9aa99a" strokeWidth="2" />
      <path d="M42 25h43c10 0 16 9 16 18s-6 17-15 17H42c-8 0-13-7-13-17s5-18 13-18Z" fill={body} stroke="#3d5944" />
      <path d="M47 29v27M53 29v27" stroke="#2d4937" strokeOpacity=".5" strokeWidth="3" />
      <path d="M37 25c-13 0-15 35 0 35h8V25Z" fill={dark} />
      <rect x="90" y="31" width="17" height="25" rx="5" fill={metal} stroke="#758276" />
      <rect x="104" y="35" width="13" height="17" rx="3" fill={dark} /><path d="M117 41h26v4h-26z" fill={metal} />
      <path d="M61 34h18" stroke="#d0dfcd" strokeWidth="2" strokeLinecap="round" />
      <rect x="70" y="58" width="12" height="7" rx="2" fill="#263b2e" />
      <path d="M59 66h7m-9 6h7m-9 6h7m-9 6h7" stroke="#94a793" strokeWidth="1.5" />
      <path d="M40 31v23" stroke="#657066" strokeWidth="2" />
    </g>}
    {kind === 'drill' && <g transform="translate(10 12) rotate(-8 90 55)">
      <path d="m70 56 20 1-4 49H63z" fill={dark} /><path d="m73 59 8 1-2 36H67z" fill={body} />
      <path d="M53 25h63v32H54c-9 0-15-6-15-16s6-16 14-16Z" fill={body} stroke="#a3723f" />
      <path d="M53 29h39" stroke="#f3d6a1" strokeWidth="2" /><path d="M48 34v15m6-15v15m6-15v15" stroke="#7b552f" strokeWidth="2.5" />
      <path d="M99 25h21v32H99z" fill={dark} /><rect x="116" y="29" width="18" height="24" rx="4" fill={metal} />
      <rect x="130" y="33" width="16" height="16" rx="3" fill={dark} /><path d="M145 39h35v4h-35z" fill={metal} />
      <path d="M86 55h26v39H99V68H86" stroke="#343e36" strokeWidth="9" strokeLinejoin="round" />
      <path d="M64 103h25v9H60v-6z" fill={dark} /><path d="m72 68 10 1m-11 6 10 1m-11 6 10 1m-11 6 10 1" stroke="#788073" strokeWidth="2" />
      <path d="M89 55v8" stroke="#ecce95" strokeWidth="5" strokeLinecap="round" />
      <path d="M58 112c-10 10-29 1-39 7" stroke="#414b43" strokeWidth="2" strokeLinecap="round" />
    </g>}
    {kind === 'bits' && <g transform="translate(37 15) rotate(-8 65 56)">
      <path d="M9 12h111v49H9z" fill="#abb1a4" stroke="#6e786d" strokeWidth="2" />
      <rect x="16" y="19" width="97" height="35" rx="5" fill="#d4d7cd" />
      <rect x="5" y="59" width="119" height="47" rx="7" fill={dark} stroke="#313e34" strokeWidth="2" />
      <rect x="12" y="65" width="105" height="33" rx="3" fill="#718471" />
      {Array.from({ length: 8 }, (_, index) => <g key={index} transform={`translate(${19 + index * 12} 0)`}>
        <rect x="0" y="30" width="6" height="21" rx="1" fill={metal} /><path d="m1 30 2-6 2 6" fill="#7e887f" />
        <rect x="0" y="73" width="6" height="20" rx="1" fill={metal} /><path d="m1 73 2-6 2 6" fill="#bcc3b7" />
      </g>)}
      <rect x="54" y="102" width="22" height="7" rx="2" fill="#c0c7b8" /><path d="M43 10V5h44v5" stroke="#535f52" strokeWidth="4" />
    </g>}
    {kind === 'level' && <g transform="translate(53 15) rotate(-8 48 57)">
      <path d="m6 30 49-12 35 18v65l-49 13L6 95Z" fill={body} stroke="#3f5845" strokeWidth="2" />
      <path d="m6 30 35 18 49-12M41 48v66" stroke="#304c39" strokeWidth="2" />
      <path d="m55 18 35 18-49 12L6 30Z" fill="#a8b7a0" />
      <path d="M13 49v36l20 11V59Z" fill={dark} />
      <path d="m20 62 8 4v13l-8-4z" fill="#a9cc91" /><path d="m46 56 38-10v47l-38 10z" fill={dark} />
      <circle cx="64" cy="72" r="11" fill="#82977f" /><circle cx="64" cy="72" r="7" fill="#20382d" /><circle cx="62" cy="70" r="3" fill="#aac7ac" />
      <path d="M50 91 78 84" stroke="#7b9177" strokeWidth="2" />
      <path d="m42 24 19 7-20 6-17-8z" fill="#566a54" /><circle cx="43" cy="29" r="3" fill="#bfd7aa" />
      <path d="m20 103-4 14m56-11 8 11" stroke="#52644f" strokeWidth="5" strokeLinecap="round" />
    </g>}
  </svg>
}
