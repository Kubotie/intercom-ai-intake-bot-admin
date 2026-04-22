"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { DailyStat } from "@/lib/nocodb";

interface Props {
  data: DailyStat[];
}

export function TrendChart({ data }: Props) {
  const formatted = data.map(d => ({
    ...d,
    date: d.date.slice(5), // "MM-DD"
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={formatted} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
          labelStyle={{ fontWeight: 600 }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="replies"      name="返信"       fill="#6366f1" radius={[2, 2, 0, 0]} />
        <Bar dataKey="skillAccepted" name="Skill採用"  fill="#22c55e" radius={[2, 2, 0, 0]} />
        <Bar dataKey="handoffs"     name="Handoff"    fill="#f59e0b" radius={[2, 2, 0, 0]} />
        <Bar dataKey="escalations"  name="Escalation" fill="#ef4444" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
