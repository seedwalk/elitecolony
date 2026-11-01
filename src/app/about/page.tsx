export const metadata = { title: "About & credits — ED BubblePlanner" };

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="text-orange-400 underline">
    {children}
  </a>
);

export default function AboutPage() {
  return (
    <div className="prose prose-invert mx-auto max-w-3xl space-y-6 py-6 text-sm leading-relaxed">
      <section>
        <h1 className="text-2xl font-semibold">About ED BubblePlanner</h1>
        <p className="mt-2 text-muted-foreground">
          A planner for colonising a <em>mini bubble</em>: a capital plus a few neighbouring systems that, together, cover
          the economies you want. Instead of looking for one perfect system, it searches for groups of claimable systems
          within claim range of each other and ranks them with weights you control.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Credits &amp; thanks</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>
            <strong>Gareth Harper</strong> for <A href="https://spansh.co.uk">Spansh</A>, whose public search API provides
            all system, body, ring, hotspot and market data used here.
          </li>
          <li>
            The <strong>Elite Dangerous Community Developers</strong> for <A href="https://github.com/EDCD/EDDN">EDDN</A>,
            the live data network that keeps Spansh up to date — and every commander running a data uploader.
          </li>
          <li>
            <A href="https://www.edsm.net">EDSM</A> (Elite Dangerous Star Map), documented as a secondary source.
          </li>
          <li>
            <strong>CMDR Mechan</strong> and contributors for the{" "}
            <A href="https://thefloweringash.com/elite/colonisation/">Elite Dangerous Colonization Mega Guide</A>, the
            source of the economy-inheritance and claim rules used for role scoring.
          </li>
          <li>
            <A href="https://edcolonise.net">ED Colonise</A> by CMDR GroobTM, the system finder that inspired this tool.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">How data is used</h2>
        <p className="mt-2 text-muted-foreground">
          Requests go to Spansh through a thin proxy (Spansh does not allow browser cross-origin calls), identified with
          the user agent <code>ED-BubblePlanner</code>. Requests are rate-limited (2 at a time, with backoff) and cached in
          your browser (IndexedDB) so the same region is not downloaded twice. Nothing is stored on a server.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Disclaimer</h2>
        <p className="mt-2 text-muted-foreground">
          ED BubblePlanner is an unofficial, non-commercial fan tool. It is not endorsed by nor reflects the views or
          opinions of Frontier Developments plc, and no employee of Frontier Developments was involved in making it. Elite
          Dangerous is a trademark of Frontier Developments plc. Role scores are estimates derived from community research
          — always verify in game before claiming.
        </p>
      </section>
    </div>
  );
}
