import { MapPin } from "lucide-react";
import { SpiderCursor as SilkSpiderCursor } from "../components/ui/SpiderCursor";

/** The blue landing stage, shared by sign-in, the waitlist note, and an invite. */
export function AuthStage({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-stage">
      <style>{AUTH_STAGE_CSS}</style>
      <a className="auth-logo" href="/welcome" data-silk-anchor>
        <MapPin aria-hidden="true" size={22} strokeWidth={1.7} />
        hoppin
      </a>
      <div className="auth-layout">
        <div className="auth-copy">{children}</div>
        <aside className="auth-ticket" data-silk-anchor aria-hidden="true">
          <span>WAITLIST</span>
          <strong>an invite is coming</strong>
          <span>seat whichever</span>
        </aside>
      </div>
      <SilkSpiderCursor bounceColor="#0d22ee" shadowColor="#000a3a" silkColor="#f6f3ec" seedWebs={8} />
    </main>
  );
}

const AUTH_STAGE_CSS = `
.auth-stage { position: relative; min-height: 100svh; background: #0d22ee; color: #f6f3ec; overflow-x: clip;
  font-family: "Helvetica Neue", "Neue Haas Grotesk Text", Inter, Arial, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.auth-logo { position: absolute; z-index: 3; top: 22px; left: clamp(16px, 4.5vw, 64px); display: inline-flex; align-items: center; gap: 8px;
  font-size: 22px; font-weight: 500; letter-spacing: -0.03em; color: #f6f3ec; text-decoration: none; }
.auth-layout { position: relative; z-index: 2; display: grid; grid-template-columns: minmax(0, 480px) 220px; gap: 48px; align-items: center; justify-content: center;
  min-height: 100svh; padding: 96px 24px 48px; }
.auth-title { margin: 0; font-size: clamp(52px, 7vw, 84px); line-height: 0.88; font-weight: 500; letter-spacing: -0.06em; }
.auth-lede { margin: 14px 0 22px; max-width: 36rem; font-size: 17px; font-weight: 300; line-height: 1.45; color: rgba(246, 243, 236, 0.9); }
.auth-card { background: #f6f3ec; color: #101428; border-radius: 22px; padding: 22px; transform: rotate(-0.6deg);
  box-shadow: 0 24px 50px -18px rgba(0, 4, 60, 0.55); }
.auth-ticket { width: 210px; padding: 16px 16px 14px; color: #2a2116; background: #f5ecd8; border-radius: 6px; transform: rotate(6deg);
  box-shadow: 0 22px 40px -16px rgba(0,4,60,0.6);
  background-image: radial-gradient(circle at 0 50%, #0d22ee 9px, transparent 10px), radial-gradient(circle at 100% 50%, #0d22ee 9px, transparent 10px);
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
.auth-ticket span { display: flex; justify-content: space-between; font-size: 10px; letter-spacing: 0.12em; }
.auth-ticket strong { display: block; margin: 12px 0; padding: 10px 0; border-top: 1.5px dashed rgba(42,33,22,0.4); border-bottom: 1.5px dashed rgba(42,33,22,0.4);
  font-family: Georgia, "Times New Roman", serif; font-style: italic; font-weight: 500; font-size: 26px; line-height: 1.05; }
.auth-stage a:focus-visible { outline: 2px solid #fff; outline-offset: 3px; border-radius: 999px; }
@media (max-width: 760px) {
  .auth-layout { grid-template-columns: minmax(0, 480px); padding-top: 84px; }
  .auth-ticket { display: none; }
  .auth-title { font-size: 56px; }
}
`;
