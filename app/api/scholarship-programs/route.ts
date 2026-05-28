import { NextResponse } from "next/server";
import { fetchScholarshipProgramSettings } from "@/lib/scholarship-settings-server";

export async function GET() {
  const programs = await fetchScholarshipProgramSettings();
  return NextResponse.json({ success: true, programs });
}
