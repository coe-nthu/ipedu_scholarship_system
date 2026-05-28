import { fetchScholarshipProgramSettings } from "@/lib/scholarship-settings-server";
import { ScholarshipSelectionClient } from "./scholarship-selection-client";

export const dynamic = "force-dynamic";

export default async function ScholarshipSelectionPage() {
  const programs = await fetchScholarshipProgramSettings();
  return <ScholarshipSelectionClient initialPrograms={programs} />;
}
