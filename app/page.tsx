const features = [
  {
    number: "01",
    title: "Car Development",
    description:
      "Kembangkan performa mobil, tentukan prioritas upgrade, dan bangun paket kompetitif untuk setiap karakter sirkuit.",
    tag: "ENGINEERING",
  },
  {
    number: "02",
    title: "Team Operations",
    description:
      "Kelola perjalanan tim, susun strategi, dan ambil keputusan yang menentukan arah musim kompetisi.",
    tag: "MANAGEMENT",
  },
  {
    number: "03",
    title: "Caleris Economy",
    description:
      "Terima penghasilan, ajukan transaksi, dan gunakan Caleris Pound untuk mendukung perkembangan karier.",
    tag: "ECONOMY",
  },
];

const divisions = [
  {
    name: "CALERIS PREMIO",
    tier: "01",
    description: "The premier championship. The highest level of competition.",
    accent: "red",
  },
  {
    name: "CALERIS ZWEI",
    tier: "02",
    description: "The proving ground. Earn your place among the best.",
    accent: "gold",
  },
];

const steps = [
  ["01", "BUILD", "Bentuk identitas dan bangun fondasi karier motorsport."],
  ["02", "DEVELOP", "Investasikan sumber daya untuk meningkatkan performa."],
  ["03", "COMPETE", "Bersaing, kumpulkan poin, dan kejar gelar juara."],
];

export default function Home() {
  return (
    <main>
      <div className="topline">
        <span>CALERIS MOTORSPORT WORLD</span>
        <span className="topline-right"><i /> THE GRID IS WAITING</span>
      </div>

      <header className="site-header">
        <a className="brand" href="#home" aria-label="Caleris Masters home">
          <span className="brand-mark">C<span>.</span></span>
          <span className="brand-name">CALERIS <b>MASTERS</b></span>
        </a>
        <nav className="desktop-nav" aria-label="Navigasi utama">
          <a href="#world">THE WORLD</a>
          <a href="#divisions">CHAMPIONSHIPS</a>
          <a href="#features">GAME FEATURES</a>
          <a href="#how-it-works">HOW TO PLAY</a>
        </nav>
        <a className="header-cta" href="#member-access">MEMBER ACCESS <span>↗</span></a>
      </header>

      <section className="hero" id="home">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-copy">
          <div className="eyebrow"><span /> A DIFFERENT KIND OF MOTORSPORT</div>
          <h1>MORE THAN<br />A <em>RACE.</em></h1>
          <p className="hero-lead">
            A world built around every decision you make.
            Develop your machine. Lead your team. Write your legacy.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#world">EXPLORE THE WORLD <span>↗</span></a>
            <a className="text-link" href="#divisions">DISCOVER THE GRID <span>↓</span></a>
          </div>
          <div className="hero-footnote">
            <span>01 / 03</span>
            <span>THE NEXT CHAPTER STARTS HERE</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-redline" />
          <div className="art-number">01</div>
          <div className="art-caption"><span>CM</span><span>EST. IN COMPETITION</span></div>
          <div className="art-cross cross-one">+</div>
          <div className="art-cross cross-two">+</div>
        </div>
        <div className="hero-bottom">
          <span>PRECISION / STRATEGY / AMBITION</span>
          <span>SCROLL TO EXPLORE <b>↓</b></span>
        </div>
      </section>

      <section className="intro section-pad" id="world">
        <div className="section-kicker"><span>01</span> / THE CALERIS WORLD</div>
        <div className="intro-content">
          <h2>THE RACE IS ONLY<br />THE <em>BEGINNING.</em></h2>
          <div className="intro-description">
            <p>
              CALERIS MASTERS adalah dunia motorsport roleplay tempat kompetisi
              bertemu strategi dan manajemen. Di sini, perjalananmu tidak berhenti
              ketika lampu start padam.
            </p>
            <p>
              Setiap keputusan punya konsekuensi. Setiap pengembangan punya tujuan.
              Setiap musim adalah kesempatan untuk membangun sejarah baru.
            </p>
          </div>
        </div>
        <div className="intro-rule"><span>BUILT FOR THE COMPETITIVE MIND</span><span>CM / 001</span></div>
      </section>

      <section className="divisions section-pad" id="divisions">
        <div className="section-heading">
          <div>
            <div className="section-kicker"><span>02</span> / THE CHAMPIONSHIPS</div>
            <h2>FIND YOUR<br /><em>PLACE ON THE GRID.</em></h2>
          </div>
          <p>Two divisions. One ambition.<br />A championship worth fighting for.</p>
        </div>
        <div className="division-list">
          {divisions.map((division) => (
            <article className={`division-card ${division.accent}`} key={division.name}>
              <span className="division-tier">DIVISION {division.tier}</span>
              <div className="division-main">
                <h3>{division.name}</h3>
                <p>{division.description}</p>
              </div>
              <span className="division-arrow" aria-hidden="true">↗</span>
            </article>
          ))}
        </div>
        <p className="division-note">PROMOTION IS EARNED. LEGACY IS BUILT.</p>
      </section>

      <section className="features section-pad" id="features">
        <div className="section-heading feature-heading">
          <div>
            <div className="section-kicker"><span>03</span> / BEYOND THE TRACK</div>
            <h2>YOUR MOVE.<br /><em>YOUR RESPONSIBILITY.</em></h2>
          </div>
          <p>Not just a spectator experience.<br />Take control of your motorsport journey.</p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <div className="feature-top"><span>{feature.number}</span><span>{feature.tag}</span></div>
              <div className="feature-icon" aria-hidden="true">{feature.number === "01" ? "⌁" : feature.number === "02" ? "◈" : "¢"}</div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
              <span className="feature-line" />
            </article>
          ))}
        </div>
        <div className="feature-foot">MORE SYSTEMS. MORE DECISIONS. MORE WAYS TO MAKE YOUR MARK.</div>
      </section>

      <section className="journey section-pad" id="how-it-works">
        <div className="section-kicker"><span>04</span> / THE JOURNEY</div>
        <div className="journey-title">
          <h2>FROM THE<br /><em>GARAGE TO GLORY.</em></h2>
          <p>Your career is shaped by what you do between race weekends.</p>
        </div>
        <div className="steps">
          {steps.map(([number, title, description]) => (
            <article className="step" key={number}>
              <span className="step-number">{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="member-cta section-pad" id="member-access">
        <div className="cta-mark" aria-hidden="true">C.</div>
        <div className="section-kicker"><span>05</span> / YOUR NEXT MOVE</div>
        <h2>THE GRID<br />IS <em>YOURS.</em></h2>
        <p>Prepare your strategy. Your next chapter in CALERIS MASTERS starts here.</p>
        <span className="coming-soon">MEMBER PORTAL — COMING IN THE NEXT PHASE</span>
      </section>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#home">
          <span className="brand-mark">C<span>.</span></span>
          <span className="brand-name">CALERIS <b>MASTERS</b></span>
        </a>
        <span className="footer-center">A MOTORSPORT ROLEPLAY WORLD</span>
        <a className="back-top" href="#home">BACK TO TOP ↑</a>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} CALERIS MASTERS</span>
          <span>BUILT AROUND THE LOVE OF COMPETITION.</span>
        </div>
      </footer>
    </main>
  );
}
