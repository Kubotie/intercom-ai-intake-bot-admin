import { NextResponse } from "next/server";
import { loadPolicies } from "@/lib/policy-reader";

export const dynamic = "force-dynamic";

export async function GET() {
  const policies = loadPolicies();
  const githubReady = Boolean(process.env.GITHUB_TOKEN);
  return NextResponse.json({ list: policies, githubReady });
}
