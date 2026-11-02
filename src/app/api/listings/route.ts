import { getApi } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return getApi().listings(request);
}
export async function POST(request: Request) {
  return getApi().listings(request);
}
