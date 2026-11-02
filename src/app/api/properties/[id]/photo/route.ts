import { getApi } from "@/server/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return getApi().uploadPhoto(request, (await context.params).id);
}
