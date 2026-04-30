import { type NextRequest, NextResponse } from "next/server";
import { getSkills, updateSkill, deleteSkill } from "@/lib/nocodb";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ skillKey: string }> }) {
  try {
    const { skillKey } = await params;
    const body = await request.json();

    const list = await getSkills();
    const skill = list.find(s => s.skill_key === skillKey);
    if (!skill) {
      return NextResponse.json({ error: "skill not found" }, { status: 404 });
    }

    const { label, description, source_type, source_config, prompt_template, threshold, status, intents } = body;
    await updateSkill(skill.Id, {
      ...(label           !== undefined && { label }),
      ...(description     !== undefined && { description }),
      ...(source_type     !== undefined && { source_type }),
      ...(source_config   !== undefined && { source_config }),
      ...(prompt_template !== undefined && { prompt_template }),
      ...(threshold       !== undefined && { threshold }),
      ...(status          !== undefined && { status }),
      ...(intents         !== undefined && { intents }),
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ skillKey: string }> }) {
  try {
    const { skillKey } = await params;

    const list = await getSkills();
    const skill = list.find(s => s.skill_key === skillKey);
    if (!skill) {
      return NextResponse.json({ error: "skill not found" }, { status: 404 });
    }

    await deleteSkill(skill.Id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
