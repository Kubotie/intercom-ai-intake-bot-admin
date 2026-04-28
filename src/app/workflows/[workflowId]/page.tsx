import { CanvasClient } from "./canvas-client";
import type { Concierge, TestTarget, WorkflowDefinition } from "@/lib/nocodb";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function fetchRecords<T>(tableId: string | undefined): Promise<T[]> {
  if (!tableId) return [];
  const base  = process.env.NOCODB_BASE_URL!;
  const token = process.env.NOCODB_API_TOKEN!;
  try {
    const res = await fetch(
      `${base}/api/v2/tables/${tableId}/records?limit=200`,
      { headers: { "xc-token": token }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.list ?? []) as T[];
  } catch {
    return [];
  }
}

export default async function WorkflowEditorPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const { workflowId } = await params;

  const [concierges, testTargets, workflows] = await Promise.all([
    fetchRecords<Concierge>(process.env.NOCODB_CONCIERGES_TABLE_ID),
    fetchRecords<TestTarget>(process.env.NOCODB_TEST_TARGETS_TABLE_ID),
    fetchRecords<WorkflowDefinition>(process.env.NOCODB_WORKFLOWS_TABLE_ID),
  ]);

  if (concierges.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <p className="text-zinc-500 text-sm">コンシェルジュが登録されていません。</p>
        <Link
          href="/concierges"
          className="text-sm px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          /concierges でコンシェルジュを作成 →
        </Link>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100vh" }} className="overflow-hidden">
      <CanvasClient
        concierges={concierges}
        testTargets={testTargets}
        workflows={workflows}
        initialWorkflowKey={workflowId}
      />
    </div>
  );
}
