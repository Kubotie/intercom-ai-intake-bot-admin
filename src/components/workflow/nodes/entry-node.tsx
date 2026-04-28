"use client";
import { Handle, Position } from "@xyflow/react";

export function EntryNode() {
  return (
    <div className="flex items-center justify-center w-[120px] h-[44px] rounded-full bg-zinc-800 text-white text-sm font-semibold shadow-md">
      Webhook 受信
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}
