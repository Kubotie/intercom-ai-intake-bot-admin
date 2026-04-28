"use client";
import loadDynamic from "next/dynamic";
import type { Concierge, TestTarget, WorkflowDefinition } from "@/lib/nocodb";

const WorkflowCanvas = loadDynamic(
  () => import("./workflow-canvas").then(m => ({ default: m.WorkflowCanvas })),
  { ssr: false, loading: () => null }
);

interface Props {
  concierges:         Concierge[];
  testTargets:        TestTarget[];
  workflows:          WorkflowDefinition[];
  initialWorkflowKey: string;
}

export function CanvasClient(props: Props) {
  return <WorkflowCanvas {...props} />;
}
