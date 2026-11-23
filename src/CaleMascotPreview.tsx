import {useState} from "react";
import "./cale-mascot-preview.css";

type Motion = { id: string; label: string; group: string; description: string };
const motions: Motion[] = [
  { id: "idle_default", label: "Idle", group: "Dasar", description: "Cale bernapas pelan, menggeser berat badan, dan mengayunkan ekor secara natural." },
  { id: "welcome_wave", label: "Welcome", group: "Sapaan", description: "Cale mengangkat tangan, melambaikan tangan, lalu kembali ke posisi santai." },
  { id: "welcome_salute", label: "Salute", group: "Sapaan", description: "Cale memberi hormat singkat dengan gestur pembalap." },
  { id: "tutorial_point_right", label: "Point right", group: "Tutorial", description: "Cale menunjuk ke sisi kanan untuk mengarahkan perhatian pengguna." },
  { id: "tutorial_explain", label: "Explain", group: "Tutorial", description: "Cale menggunakan gestur tangan terbuka seolah sedang menjelaskan langkah." },
  { id: "tutorial_think", label: "Thinking", group: "Tutorial", description: "Cale melihat ke atas, mengangkat satu tangan, dan berpikir sejenak." },
  { id: "reaction_success", label: "Success", group: "Reaksi", description: "Cale mengangguk mantap dengan ekspresi puas." },
  { id: "reaction_warning", label: "Warning", group: "Reaksi", description: "Cale mengangkat telapak tangan untuk memberi peringatan." },
  { id: "interaction_celebrate", label: "Celebrate", group: "Reaksi", description: "Cale mengangkat kedua tangan merayakan keberhasilan." },
  { id: "motorsport_ready", label: "Race ready", group: "Motorsport", description: "Cale menyesuaikan sarung tangan dan mengambil posisi siap." }
];

function CaleFigure({ motion }: { motion: string }) {
  return <svg className={`cale-figure cale-motion--${motion}`} viewBox="0 0 520 700" role="img" aria-label="Cale, maskot panther Caleris Masters">
    <defs>
      <linearGradient id="fur" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#303238"/><stop offset=".34" stopColor="#111318"/><stop offset=".72" stopColor="#050609"/><stop offset="1" stopColor="#25272c"/></linearGradient>
      <linearGradient id="furLight" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#555961"/><stop offset=".42" stopColor="#171a20"/><stop offset="1" stopColor="#07080b"/></linearGradient>
      <linearGradient id="suit" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#292b30"/><stop offset=".28" stopColor="#101216"/><stop offset=".7" stopColor="#050609"/><stop offset="1" stopColor="#202228"/></linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff0a6"/><stop offset=".28" stopColor="#d9b64c"/><stop offset=".65" stopColor="#94701c"/><stop offset="1" stopColor="#f0d777"/></linearGradient>
      <linearGradient id="silver" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#656a73"/><stop offset=".5" stopColor="#e1e3e6"/><stop offset="1" stopColor="#737983"/></linearGradient>
      <radialGradient id="eye"><stop stopColor="#fff2a0"/><stop offset=".45" stopColor="#e8b936"/><stop offset="1" stopColor="#9b6410"/></radialGradient>
      <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
      <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <ellipse cx="258" cy="658" rx="112" ry="12" fill="#000" opacity=".45" filter="url(#softShadow)"/>
    <g className="cale-tail">
      <path d="M292 390 C355 395 393 420 432 415 C469 410 486 388 499 401 C511 416 488 439 460 443 C408 451 368 420 315 427" fill="none" stroke="#050609" strokeWidth="19" strokeLinecap="round"/>
      <path d="M292 390 C355 395 393 420 432 415 C469 410 486 388 499 401 C511 416 488 439 460 443 C408 451 368 420 315 427" fill="none" stroke="#343840" strokeWidth="5" strokeLinecap="round" opacity=".62"/>
      <path d="M490 395 Q507 391 510 405" fill="none" stroke="#777d87" strokeWidth="2" opacity=".35"/>
    </g>
    <g className="cale-legs">
      <g className="cale-leg cale-leg--left">
        <path d="M205 411 L257 411 L249 590 L239 630 L185 630 L188 591 Z" fill="url(#suit)" stroke="#4b4e55" strokeWidth="2"/>
        <path d="M194 426 L204 426 L199 591 L190 591 Z" fill="url(#gold)"/>
        <path d="M188 588 L242 588 L239 620 L181 620 Z" fill="#111318" stroke="#b28a2d" strokeWidth="2"/>
        <path d="M178 618 Q210 614 244 620 L255 645 Q255 653 246 654 L169 654 Q163 650 169 641 Z" fill="#090a0d" stroke="#555a63" strokeWidth="2"/>
        <path d="M176 644 L246 644" stroke="url(#gold)" strokeWidth="3"/>
      </g>
      <g className="cale-leg cale-leg--right">
        <path d="M263 411 L315 411 L332 591 L337 630 L282 630 L270 591 Z" fill="url(#suit)" stroke="#4b4e55" strokeWidth="2"/>
        <path d="M310 426 L320 426 L330 591 L319 591 Z" fill="url(#gold)"/>
        <path d="M276 588 L330 588 L338 620 L280 620 Z" fill="#111318" stroke="#b28a2d" strokeWidth="2"/>
        <path d="M277 618 Q309 614 341 620 L352 641 Q354 651 344 654 L270 654 Q262 650 268 641 Z" fill="#090a0d" stroke="#555a63" strokeWidth="2"/>
        <path d="M270 644 L344 644" stroke="url(#gold)" strokeWidth="3"/>
      </g>
    </g>
    <g className="cale-arms">
      <g className="cale-arm cale-arm--left">
        <path d="M183 253 Q153 251 139 279 L111 355 Q105 373 119 382 L139 389 Q154 390 161 373 L191 307 Z" fill="url(#furLight)" stroke="#3c4048" strokeWidth="3"/>
        <path d="M142 283 L126 345" stroke="url(#gold)" strokeWidth="7" opacity=".9"/>
        <path d="M111 355 Q101 372 118 384 L138 391 Q150 391 157 379 L146 370 L124 361 Z" fill="#0a0c10" stroke="url(#gold)" strokeWidth="3"/>
        <path d="M111 367 L139 381" stroke="#c6a13a" strokeWidth="3"/>
        <path d="M120 383 L112 399 M130 388 L125 404 M140 389 L138 402" stroke="#20242b" strokeWidth="7" strokeLinecap="round"/>
      </g>
      <g className="cale-arm cale-arm--right">
        <path d="M337 253 Q367 251 381 279 L409 355 Q415 373 401 382 L381 389 Q366 390 359 373 L329 307 Z" fill="url(#furLight)" stroke="#3c4048" strokeWidth="3"/>
        <path d="M378 283 L394 345" stroke="url(#gold)" strokeWidth="7" opacity=".9"/>
        <path d="M409 355 Q419 372 402 384 L382 391 Q370 391 363 379 L374 370 L396 361 Z" fill="#0a0c10" stroke="url(#gold)" strokeWidth="3"/>
        <path d="M400 367 L372 381" stroke="#c6a13a" strokeWidth="3"/>
        <path d="M391 383 L399 399 M381 388 L386 404 M371 389 L373 402" stroke="#20242b" strokeWidth="7" strokeLinecap="round"/>
      </g>
    </g>
    <g className="cale-torso">
      <path d="M207 207 L313 207 Q338 214 353 250 L333 425 Q260 452 187 425 L167 250 Q181 214 207 207 Z" fill="url(#suit)" stroke="#555962" strokeWidth="2.5"/>
      <path d="M207 210 L185 235 L169 257 L195 278 L218 239 Z" fill="url(#gold)"/>
      <path d="M313 210 L335 235 L351 257 L325 278 L302 239 Z" fill="url(#gold)"/>
      <path d="M188 262 L204 270 L191 408 L178 403 Z" fill="#9b7624"/>
      <path d="M332 262 L316 270 L329 408 L342 403 Z" fill="#9b7624"/>
      <path d="M205 224 L260 245 L315 224 L302 410 L218 410 Z" fill="url(#suit)" stroke="#353941" strokeWidth="1.5"/>
      <path d="M260 242 L260 412" stroke="url(#silver)" strokeWidth="2" opacity=".65"/>
      <path d="M215 245 L229 252 L217 400" stroke="#4b5058" strokeWidth="2" fill="none"/>
      <path d="M305 245 L291 252 L303 400" stroke="#4b5058" strokeWidth="2" fill="none"/>
      <path d="M193 286 L208 294 L197 386" stroke="url(#gold)" strokeWidth="3" fill="none"/>
      <path d="M327 286 L312 294 L323 386" stroke="url(#gold)" strokeWidth="3" fill="none"/>
      <path d="M199 408 Q260 420 321 408 L324 430 Q260 444 196 430 Z" fill="#08090c" stroke="#b18b2d" strokeWidth="2"/>
      <path d="M245 416 L275 416 L275 435 L245 435 Z" fill="#17191e" stroke="url(#gold)" strokeWidth="2"/>
      <path d="M251 419 L269 419 L269 432 L251 432 Z" fill="url(#gold)"/>
      <path d="M258 422 L263 422 L263 429 L258 429 Z" fill="#15161a"/>
      <path d="M212 238 Q260 252 308 238" fill="none" stroke="#d2d5d8" strokeWidth="1.4" opacity=".4"/>
      <path d="M193 271 L209 277 M327 271 L311 277" stroke="#e5d38d" strokeWidth="1.4" opacity=".55"/>
      <g className="cale-chest-logos">
        <image href="/assets/cale-caleris-logo.svg" x="192" y="278" width="66" height="22" preserveAspectRatio="xMidYMid meet"/>
        <image href="/assets/cale-vreeo-logo.svg" x="269" y="270" width="39" height="29" preserveAspectRatio="xMidYMid meet"/>
      </g>
      <path d="M194 306 Q210 310 225 306 M295 306 Q310 310 326 306" stroke="#777d86" strokeWidth="1" opacity=".38"/>
      <path d="M205 345 L315 345" stroke="#30343b" strokeWidth="1" opacity=".45"/>
      <path d="M212 372 L308 372" stroke="#30343b" strokeWidth="1" opacity=".45"/>
      <path d="M204 249 L215 260 M316 249 L305 260" stroke="url(#silver)" strokeWidth="1.5" opacity=".55"/>
    </g>
    <g className="cale-neck">
      <path d="M224 181 L296 181 L305 225 Q260 246 215 225 Z" fill="url(#fur)" stroke="#41454d" strokeWidth="2"/>
      <path d="M213 205 Q260 220 307 205 L312 229 Q260 247 208 229 Z" fill="#080a0e" stroke="url(#gold)" strokeWidth="4"/>
      <path d="M219 214 Q260 229 301 214" fill="none" stroke="#6c5523" strokeWidth="2"/>
    </g>
    <g className="cale-head">
      <path d="M197 103 L177 43 Q173 30 187 39 L230 72 Z" fill="url(#fur)" stroke="#444851" strokeWidth="3"/>
      <path d="M323 103 L343 43 Q347 30 333 39 L290 72 Z" fill="url(#fur)" stroke="#444851" strokeWidth="3"/>
      <path d="M191 84 L188 53 L215 83 Z" fill="#5b2428" opacity=".65"/>
      <path d="M329 84 L332 53 L305 83 Z" fill="#5b2428" opacity=".65"/>
      <path d="M190 89 Q260 43 330 89 Q353 115 341 166 Q332 207 260 217 Q188 207 179 166 Q167 115 190 89 Z" fill="url(#furLight)" stroke="#535862" strokeWidth="3"/>
      <path d="M187 117 Q199 77 233 72 M333 117 Q321 77 287 72" fill="none" stroke="#737984" strokeWidth="2" opacity=".22"/>
      <path d="M198 132 Q222 113 245 133 Q224 154 199 143 Z" fill="#08090d" stroke="#6b7079" strokeWidth="2"/>
      <path d="M275 133 Q298 113 322 132 L321 143 Q296 154 275 133 Z" fill="#08090d" stroke="#6b7079" strokeWidth="2"/>
      <g className="cale-eyes">
        <path d="M204 134 Q224 119 240 135 Q224 149 204 140 Z" fill="url(#eye)" stroke="#f1cf65" strokeWidth="1.5"/>
        <path d="M280 135 Q296 119 316 134 L316 140 Q296 149 280 135 Z" fill="url(#eye)" stroke="#f1cf65" strokeWidth="1.5"/>
        <ellipse cx="223" cy="135" rx="3.5" ry="10" fill="#07080a"/>
        <ellipse cx="297" cy="135" rx="3.5" ry="10" fill="#07080a"/>
        <circle cx="220" cy="131" r="2" fill="#fff6c7"/>
        <circle cx="294" cy="131" r="2" fill="#fff6c7"/>
      </g>
      <path d="M199 125 Q222 108 244 125 M276 125 Q298 108 321 125" fill="none" stroke="#08090c" strokeWidth="8" strokeLinecap="round"/>
      <path d="M208 158 Q225 146 243 158 M277 158 Q295 146 312 158" fill="none" stroke="#1a1d23" strokeWidth="5" strokeLinecap="round"/>
      <path d="M224 156 Q260 149 296 156 Q293 185 260 194 Q227 185 224 156 Z" fill="#272a30" stroke="#4d525b" strokeWidth="2"/>
      <path d="M248 170 Q260 162 272 170 Q270 181 260 182 Q250 181 248 170 Z" fill="#101115" stroke="#777d86" strokeWidth="1.5"/>
      <path d="M260 181 L260 188 M260 188 Q246 198 237 189 M260 188 Q274 198 283 189" fill="none" stroke="#9a9da3" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M211 176 L174 167 M211 183 L168 184 M214 190 L181 203 M309 176 L346 167 M309 183 L352 184 M306 190 L339 203" stroke="#d0d2d5" strokeWidth="1.3" strokeLinecap="round" opacity=".8"/>
      <path d="M205 104 L224 96 M315 104 L296 96" stroke="#7c828b" strokeWidth="2" opacity=".3"/>
    </g>
    <g className="cale-shoulder-details" fill="none" stroke="url(#gold)" strokeWidth="2">
      <path d="M174 256 Q186 244 203 239"/>
      <path d="M346 256 Q334 244 317 239"/>
      <path d="M183 271 L170 320"/>
      <path d="M337 271 L350 320"/>
    </g>
  </svg>;
}

export default function CaleMascotPreview() {
  const [motion, setMotion] = useState("idle_default");
  const [replay, setReplay] = useState(0);
  const active = motions.find((item) => item.id === motion) ?? motions[0];
  const groups = [...new Set(motions.map((item) => item.group))];
  const play = (id: string) => { setMotion(id); setReplay((value) => value + 1); };
  return <main className="cale-lab">
    <header className="cale-lab__header">
      <div><span className="cale-lab__eyebrow">CALERIS MASTERS · CHARACTER LAB</span><h1>Meet <span>Cale.</span></h1><p>Prototype maskot interaktif · SVG + CSS motion · tanpa file GLB</p></div>
      <span className="cale-lab__status"><i/> PREVIEW BUILD</span>
    </header>
    <section className="cale-lab__workspace">
      <div className="cale-stage">
        <div className="cale-stage__top"><span>CALE / MASTER LOOK</span><span>ALPHA CANVAS</span></div>
        <div className="cale-stage__character" key={replay}><CaleFigure motion={motion}/></div>
        <div className="cale-stage__floor"><span>01</span><span>BLACK PANTHER · RACING DIVISION</span><span>GOLD / SILVER</span></div>
      </div>
      <aside className="cale-controls">
        <div className="cale-controls__heading"><span className="cale-lab__eyebrow">MOTION LIBRARY</span><span className="cale-controls__count">{motions.length.toString().padStart(2,"0")} CLIPS</span></div>
        {groups.map((group) => <section className="cale-motion-group" key={group}><h2>{group}</h2><div className="cale-motion-grid">{motions.filter((item) => item.group === group).map((item) => <button key={item.id} type="button" className={motion === item.id ? "is-active" : ""} aria-pressed={motion === item.id} onClick={() => play(item.id)}>{item.label}<span>↗</span></button>)}</div></section>)}
        <div className="cale-current"><span className="cale-lab__eyebrow">NOW PLAYING</span><strong>{active.id}</strong><p>{active.description}</p><button type="button" className="cale-replay" onClick={() => play(motion)}>↻ Replay motion</button></div>
      </aside>
    </section>
    <footer className="cale-lab__footer"><span>VISUAL PROTOTYPE · NOT A 3D / GLB MODEL</span><span>BRAND ASSETS: ORIGINAL FILES · VREEO BACKGROUND REMOVED</span></footer>
  </main>;
}
