import { useEffect, useRef, useState } from "react";
import { CobeGlobe } from "./CobeGlobe";
import { MagicRings } from "./MagicRings";
import { logo } from "./logo";
import "./landing.css";

export function InternationalMapLanding({ onEnter }: { onEnter: () => void }) {
  const [entering, setEntering] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const entered = useRef(false);
  const finished = useRef(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const complete = () => {
    if (finished.current) return;
    finished.current = true;
    onEnter();
  };
  const enter = () => {
    if (entered.current) return;
    entered.current = true;
    if (reducedMotion) complete();
    else setEntering(true);
  };
  return (
    <main
      className="atlas-landing"
      aria-label="International Service Map entrance"
    >
      <header className="atlas-landing-branding">
        <svg
          className="atlas-landing-logo"
          viewBox="203 139 645 352"
          role="img"
          aria-label="Occu-Med"
        >
          <image href={logo} width="1024" height="683" />
        </svg>
        <h1>International Service Map</h1>
      </header>
      <button
        type="button"
        className="atlas-landing-enter"
        onClick={enter}
        disabled={entering}
        aria-busy={entering}
      >
        Enter Map <span aria-hidden="true">→</span>
      </button>
      <section className="atlas-globe-stage" aria-label="Interactive globe">
        <CobeGlobe reducedMotion={reducedMotion} />
        {entering && <MagicRings onComplete={complete} />}
      </section>
    </main>
  );
}
