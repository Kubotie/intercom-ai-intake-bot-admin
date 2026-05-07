import { type NextRequest, NextResponse } from "next/server";
import { POLICY_FILES } from "@/lib/policy-reader";

export const dynamic = "force-dynamic";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";
const GITHUB_REPO  = "Kubotie/intercom-ai-intake-bot-admin";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH ?? "main";

function findPolicy(policyId: string) {
  return POLICY_FILES.find(
    (p) => p.rel.replace(/\W+/g, "_") === policyId
  );
}

async function getGitHubFile(filePath: string) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json() as Promise<{ content: string; sha: string; html_url: string }>;
}

async function commitGitHubFile(filePath: string, content: string, sha: string, message: string) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf-8").toString("base64"),
      sha,
      branch: GITHUB_BRANCH,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub commit error ${res.status}: ${err.slice(0, 300)}`);
  }
  return res.json() as Promise<{ commit: { html_url: string } }>;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ policyId: string }> }
) {
  const { policyId } = await params;
  const policy = findPolicy(policyId);
  if (!policy) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!GITHUB_TOKEN) {
    return NextResponse.json({ error: "GITHUB_TOKEN not set", githubReady: false }, { status: 503 });
  }

  try {
    const file = await getGitHubFile(policy.rel);
    const content = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf-8");
    return NextResponse.json({ content, sha: file.sha, htmlUrl: file.html_url, githubReady: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ policyId: string }> }
) {
  const { policyId } = await params;
  const policy = findPolicy(policyId);
  if (!policy) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!GITHUB_TOKEN) {
    return NextResponse.json({
      error: "GITHUB_TOKEN が設定されていません。Vercel 環境変数に Personal Access Token（repo スコープ）を追加してください。",
      githubReady: false,
    }, { status: 503 });
  }

  let body: { content?: string; sha?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { content, sha } = body;
  if (!content || !sha) {
    return NextResponse.json({ error: "content and sha are required" }, { status: 400 });
  }

  try {
    const filename = policy.rel.split("/").pop() ?? policy.rel;
    const result = await commitGitHubFile(
      policy.rel,
      content,
      sha,
      `policy: update ${filename} via Bot Admin UI`
    );
    return NextResponse.json({ ok: true, commitUrl: result.commit.html_url });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
