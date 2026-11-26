import { ArrowDown, ArrowUpRight, CalendarDays, Compass, Flag, Gamepad2, Globe2, Instagram, Rocket, Users } from "lucide-react";
import "./about-us.css";

const founders = [
  {
    name: "Muhammad Ovella Ricky Eka Permata Putra",
    displayName: "Muhammad Ovella",
    instagram: "https://www.instagram.com/lllllaaaaa44444?rpxt=MXo5OGFyOWY5YXV2",
    role: "Co-founder",
  },
  {
    name: "Muhammad Alfarel Pratama",
    displayName: "Muhammad Alfarel",
    instagram: "https://www.instagram.com/alfredo_owenzaus?dlrf=MWh0d3F6czBwbXpxNw==",
    role: "Co-founder",
  },
  {
    name: "Agung Pradana",
    displayName: "Agung Pradana",
    instagram: "https://www.instagram.com/pradana.3?psln=bWVkaGp6aWJuMG0=",
    role: "Co-founder",
  },
  {
    name: "Liam Amir",
    displayName: "Liam Amir",
    instagram: "https://www.instagram.com/liam_amir26?xtok=aXJhOG1vZHFldGs1",
    role: "Co-founder",
  },
  {
    name: "Suhanda Arbawi",
    displayName: "Suhanda Arbawi",
    instagram: "https://www.instagram.com/_suhanda08?exln=dXp5MGIyaWN5dGgy",
    role: "Co-founder",
  },
];

const experience = [
  {
    number: "01",
    title: "Championships & race weekends",
    description: "Follow the season, check the race calendar, explore official results, and keep up with Driver and Team standings.",
    icon: Flag,
  },
  {
    number: "02",
    title: "Driver careers",
    description: "Build a Driver profile, follow career history, develop attributes, and earn your place in the paddock.",
    icon: Gamepad2,
  },
  {
    number: "03",
    title: "Teams & the paddock",
    description: "Explore teams, their line-ups, public profiles, and the people behind each racing operation.",
    icon: Users,
  },
  {
    number: "04",
    title: "Community progression",
    description: "Take part in community activities, collect achievements, follow milestones, and build your own Digital ID.",
    icon: Compass,
  },
  {
    number: "05",
    title: "Team Headquarters & merchandise",
    description: "Give your team a home in the paddock, manage its identity, and build a merchandise line for your fans.",
    icon: Users,
  },
  {
    number: "06",
    title: "Our own economy system",
    description: "A custom-built economy designed around CALERIS, with wallets, payroll, sponsorship, rewards, and team finances.",
    icon: Globe2,
  },
];

export default function AboutUs() {
  return (
    <main className="about-page">
      <section className="about-hero">
        <div className="about-hero-shade" />
        <div className="about-hero-content">
          <span className="about-kicker"><span /> VIRTUAL RELATIONS. REAL COMMUNITY.</span>
          <h1>Two brands.<br /><em>One shared passion.</em></h1>
          <p>We started with a game, a few people, and a pretty simple idea: make the racing community feel closer. Turns out, that idea had somewhere to go.</p>
          <a className="about-scroll-link" href="#our-story">OUR STORY <ArrowDown size={15} /></a>
        </div>
        <div className="about-hero-mark" aria-hidden="true">V / C</div>
      </section>

      <section className="about-intro about-section" id="our-story">
        <div className="about-section-label"><span>01</span> THE STORY SO FAR</div>
        <div className="about-intro-copy">
          <h2>It all started with<br /><em>two weeks off.</em></h2>
          <p>Back in the day, one of our founders had a two-week break while recovering from an illness. With plenty of time on hand and a growing love for the mobile racing game <strong>Monoposto</strong>, a random idea popped up: what if we ran our own championship?</p>
          <p>That little idea became <strong>Monoposto Indonesia Championship</strong>, inspired by the name of a Facebook group. The format was simple. Members picked a name, chose a team, and joined a championship against the game's AI. No complicated setup. Just racing, having fun, and seeing who came out on top.</p>
          <p>Halfway through the first season, members suggested creating a Discord server. We made one, the races kept coming, and by the end of Season 2 the community had grown to almost 200 members. That's when we realised this could be more than just an event.</p>
        </div>
      </section>

      <section className="about-timeline-wrap">
        <div className="about-timeline-heading">
          <span className="about-eyebrow">FROM A SMALL EVENT TO A BIGGER IDEA</span>
          <h2>One step led to <em>another.</em></h2>
        </div>
        <div className="about-timeline">
          <article><span className="about-timeline-index">01</span><div><small>THE FIRST GRID</small><h3>Monoposto Indonesia Championship</h3><p>A casual championship made for the fun of racing. Members signed up, picked a team, and raced against AI opponents.</p></div></article>
          <article><span className="about-timeline-index">02</span><div><small>THE COMMUNITY GROWS</small><h3>A Discord server, then almost 200 members</h3><p>Members wanted a place to hang out and stay connected. The server became the home base, and the community kept growing across two seasons.</p></div></article>
          <article><span className="about-timeline-index">03</span><div><small>FIVE PEOPLE, ONE VISION</small><h3>VREEO.ID takes shape</h3><p>Four of the most active moderators brought fresh ideas and a shared vision. The five of us became VREEO's core team, working side by side as equals. On <strong>22 May 2026</strong>, we officially established VREEO.ID and gave that shared vision a name.</p></div></article>
          <article><span className="about-timeline-index">04</span><div><small>A NEW CHAPTER</small><h3>CALERIS MASTERS is born</h3><p>We moved beyond the original Monoposto event and created a motorsport roleplay experience with its own identity, systems, and long-term plans.</p></div></article>
        </div>
      </section>

      <section className="about-vreeo about-section">
        <div className="about-section-label"><span>02</span> WHO WE ARE</div>
        <div className="about-vreeo-panel">
          <img src="/assets/Untitled%20design_20261103_142659_0000.png" alt="VREEO.ID logo" loading="lazy" decoding="async" />
          <div>
            <span className="about-eyebrow">EST. 22 MAY 2026</span>
            <h2>Meet <em>VREEO.ID.</em></h2>
            <p>VREEO stands for <strong>Virtual Relations Event Esport Organizer Indonesia</strong>. We're a community-focused organiser built around virtual events, shared interests, and the people who make them happen.</p>
            <p>There isn't a complicated hierarchy behind the scenes. The five founders work as an equal core team, bringing ideas to the table and helping the community move forward together.</p>
            <p>Our goal is pretty straightforward: create a welcoming place where people can connect, compete, and build something they’re proud to be part of.</p>
          </div>
        </div>
      </section>

      <section className="about-founders about-section">
        <div className="about-section-label"><span>03</span> THE PEOPLE BEHIND IT</div>
        <div className="about-founders-heading">
          <h2>Five founders.<br /><em>No one above the others.</em></h2>
          <p>They started as active community members and moderators. Today, they keep VREEO moving as an equal founding team. Get to know the people behind the project.</p>
        </div>
        <div className="about-founder-grid">
          {founders.map((founder, index) => (
            <article className="about-founder-card" key={founder.instagram}>
              <span className="about-founder-number">0{index + 1}</span>
              <div className="about-founder-avatar">{founder.displayName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
              <span className="about-founder-role">{founder.role}</span>
              <h3>{founder.name}</h3>
              <a href={founder.instagram} target="_blank" rel="noopener noreferrer" aria-label={`Open ${founder.displayName}'s Instagram profile`}>
                <Instagram size={15} /> Instagram <ArrowUpRight size={14} />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="about-caleris about-section">
        <div className="about-section-label"><span>04</span> OUR MOTORSPORT WORLD</div>
        <div className="about-caleris-copy">
          <span className="about-eyebrow">BUILT BY VREEO.ID</span>
          <h2>Welcome to<br /><em>CALERIS MASTERS.</em></h2>
          <p>CALERIS MASTERS is our motorsport roleplay project. It takes the spirit of a racing community and adds a whole lot more around it: Drivers, Teams, seasons, careers, progression, and an evolving paddock to call home.</p>
          <p>The name <strong>Caleris</strong> comes from Latin. The project has grown from a simple community championship into a dedicated web-game experience, with systems designed around the way our community actually plays.</p>
          <p>We moved on from Monoposto when the project became CALERIS MASTERS. Since then, we've been using <strong>Formula Game Companion (FGC)</strong> for our race weekends. We're also working on our own Race Engine for the future. It's a big step, and we're taking it one piece at a time.</p>
        </div>
        <div className="about-caleris-brand">
          <img src="/assets/Add%20a%20heading_20260907_003952_0000.png" alt="CALERIS MASTERS logo" width={500} height={500} loading="lazy" decoding="async" />
          <span>MORE THAN A RACE. IT'S YOUR PADDOCK.</span>
        </div>
      </section>

      <section className="about-experience about-section">
        <div className="about-section-label"><span>05</span> THE CALERIS EXPERIENCE</div>
        <div className="about-experience-heading"><h2>There's more to it<br />than <em>race day.</em></h2><p>CALERIS is built to give every member a place in the story, on and off the track.</p></div>
        <div className="about-experience-grid">
          {experience.map((item) => {
            const Icon = item.icon;
            return <article key={item.number}><span>{item.number}</span><Icon size={22} strokeWidth={1.6} /><h3>{item.title}</h3><p>{item.description}</p></article>;
          })}
        </div>
        <div className="about-coming-soon">
          <div><span className="about-eyebrow">THE NEXT CHAPTER</span><h3>Season 2 is taking shape.</h3><p>Season 2 is bringing the web-game experience to a whole new level, with Team Headquarters, team merchandise, and more ways to shape your place in the paddock. Our in-house Economy Engine is designed around the needs of CALERIS, rather than forcing the community into a one-size-fits-all system. Registration will be available directly on the website through Discord sign-in, so members can join while staying connected to the community.</p></div>
          <div className="about-coming-status"><Rocket size={25}/><strong>IN DEVELOPMENT</strong><small>More updates coming as we get things ready.</small></div>
        </div>
      </section>

      <section className="about-cale">
        <div className="about-cale-mascot"><img src="/assets/Cale/cale-racing.webp" alt="CALE, the official CALERIS MASTERS racing mascot" loading="eager" decoding="async" /></div>
        <div><span className="about-eyebrow">YOUR FRIENDLY PADDOCK GUIDE</span><h2>Say hi to <em>CALE.</em></h2><p>Meet CALE, our kind-hearted black panther mascot. CALE is here to help members find their way around the CALERIS in-game experience. Think of CALE as your friendly guide around the paddock.</p></div>
      </section>

      <section className="about-future about-section">
        <div className="about-section-label"><span>06</span> WHAT'S NEXT</div>
        <div className="about-future-content">
          <h2>Still building.<br /><em>Still racing forward.</em></h2>
          <p>We're working towards a more complete CALERIS experience, including our own Race Engine and a stronger community ecosystem. No overnight promises. Just a team that keeps showing up, listening to members, and making the next season better than the last.</p>
          <a href="https://discord.gg/yat2qWuyy" target="_blank" rel="noopener noreferrer" className="about-join-link">JOIN THE COMMUNITY <ArrowUpRight size={16}/></a>
        </div>
      </section>
      <div className="about-footnote"><CalendarDays size={15}/> VREEO.ID · ESTABLISHED 22 MAY 2026 <span/><Globe2 size={15}/> MADE FOR THE COMMUNITY</div>
    </main>
  );
}
