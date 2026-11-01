// Stateless proxy to the Spansh API (Spansh sends no CORS headers, so the browser can't call it directly).
// It only forwards allow-listed endpoints; nothing is stored.

const SPANSH = "https://spansh.co.uk/api";
const USER_AGENT = "ED-BubblePlanner/0.1 (colonisation planner; non-commercial community tool)";
const ALLOWED = [/^systems\/search$/, /^bodies\/search$/, /^stations\/search$/, /^search$/, /^search\/systems$/,/^system\/\d+$/, /^dump\/\d+$/];

export const maxDuration = 60;

async function forward(req: Request, segments: string[]): Promise<Response> {
  const path = segments.join("/");
  if (!ALLOWED.some((r) => r.test(path))) {
    return Response.json({ error: `Endpoint not allowed: ${path}` }, { status: 400 });
  }
  const url = new URL(req.url);
  const target = `${SPANSH}/${path}${url.search}`;
  const init: RequestInit = {
    method: req.method,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Content-Type": "application/json" },
    cache: "no-store",
  };
  if (req.method === "POST") init.body = await req.text();
  try {
    const res = await fetch(target, init);
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/json",
        ...(res.headers.get("retry-after") ? { "Retry-After": res.headers.get("retry-after")! } : {}),
      },
    });
  } catch (e) {
    return Response.json({ error: `Upstream error: ${(e as Error).message}` }, { status: 502 });
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
