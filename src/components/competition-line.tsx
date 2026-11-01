import type { Competition } from "@/lib/engine/bubbles";

/** "Claim from X (9 ly) · Nearest other colony 6.2 ly · 2 in claim range · 7 within 35 ly · 1 being built" (claim contact excluded) */
export function CompetitionLine({ c, claimRange, radius }: { c: Competition; claimRange: number; radius: number }) {
  const tone =
    c.nearestColonyLy === null ? "text-emerald-400" : c.nearestColonyLy <= claimRange ? "text-amber-300" : "text-foreground";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground" title="Other colonies (colonised or being colonised), excluding the system you claim from">
      {c.claimContactName && (
        <>
          <span>
            Claim from <span className="text-emerald-400">{c.claimContactName}</span> ({c.claimContactLy!.toFixed(1)} ly)
          </span>
          <span>·</span>
        </>
      )}
      <span>
        Nearest other colony{" "}
        <span className={`font-medium ${tone}`}>
          {c.nearestColonyLy === null ? "none nearby" : `${c.nearestColonyLy.toFixed(1)} ly`}
        </span>
        {c.nearestColonyName && <span className="text-muted-foreground/70"> ({c.nearestColonyName})</span>}
      </span>
      <span>·</span>
      <span className={c.inClaimRange > 0 ? "text-amber-300" : ""}>
        {c.inClaimRange} in claim range ({claimRange} ly)
      </span>
      <span>·</span>
      <span>
        {c.inRadius} within {radius} ly
      </span>
      {c.activeInRadius > 0 && (
        <>
          <span>·</span>
          <span>{c.activeInRadius} being built</span>
        </>
      )}
    </div>
  );
}
