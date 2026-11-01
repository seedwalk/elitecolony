import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t py-4 text-center text-xs text-muted-foreground">
      <p>
        Data from{" "}
        <a className="underline" href="https://spansh.co.uk" target="_blank" rel="noreferrer">
          Spansh
        </a>{" "}
        (by Gareth Harper), fed by{" "}
        <a className="underline" href="https://github.com/EDCD/EDDN" target="_blank" rel="noreferrer">
          EDDN
        </a>
        . Colonisation rules from the community{" "}
        <a className="underline" href="https://thefloweringash.com/elite/colonisation/" target="_blank" rel="noreferrer">
          Colonization Mega Guide
        </a>{" "}
        (CMDR Mechan).{" "}
        <Link className="underline" href="/about">
          Full credits
        </Link>
      </p>
      <p className="mt-1">
        Unofficial fan tool. Not affiliated with or endorsed by Frontier Developments plc. Elite Dangerous is a trademark of
        Frontier Developments plc.
      </p>
    </footer>
  );
}
