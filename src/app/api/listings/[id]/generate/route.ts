import { getApi } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return getApi().generate(request, (await context.params).id);
}
