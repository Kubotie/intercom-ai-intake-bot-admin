import { type NextRequest, NextResponse } from "next/server";
import { getSkills, createSkill } from "@/lib/nocodb";

export const runtime = "nodejs";

export async function GET() {
  try {
    const list = await getSkills();
    return NextResponse.json({ list });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { skill_key, label, description, source_type, source_config, prompt_template, threshold, status, intents } = body;

    if (!skill_key || !label || !source_type) {
      return NextResponse.json({ error: "skill_key, label, source_type are required" }, { status: 400 });
    }

    await createSkill({
      skill_key,
      label,
      description:     description     ?? null,
      source_type,
      source_config:   source_config   ?? null,
      prompt_template: prompt_template ?? null,
      threshold:       threshold       ?? 0.65,
      status:          status          ?? "active",
      intents:         intents         ?? null,
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
