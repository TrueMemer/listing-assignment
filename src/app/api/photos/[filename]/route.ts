import { getApi } from "@/server/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ filename: string }> };
export async function GET(request: Request, context: Context) {
  return getApi().photo(request, (await context.params).filename);
}
