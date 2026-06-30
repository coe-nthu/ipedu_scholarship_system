import {
  DEFAULT_SCHOLARSHIP_PROGRAM_SETTINGS,
  mergeScholarshipProgramSettings,
  type ScholarshipProgramSetting,
} from "@/lib/scholarship-settings";

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    serviceRoleKey,
    url: url.replace(/\/$/, ""),
  };
}

export async function fetchScholarshipProgramSettings(): Promise<
  ScholarshipProgramSetting[]
> {
  const config = getSupabaseConfig();
  if (!config) {
    return DEFAULT_SCHOLARSHIP_PROGRAM_SETTINGS;
  }

  try {
    const response = await fetch(
      `${config.url}/rest/v1/scholarship_program_settings?order=display_order.asc&select=program_key,route_path,title,title_en,description,description_en,period,period_en,amount,amount_en,status_label,status_label_en,eligibility_reminder,is_visible,is_open,display_order,updated_by,created_at,updated_at`,
      {
        headers: {
          apikey: config.serviceRoleKey,
          authorization: `Bearer ${config.serviceRoleKey}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return DEFAULT_SCHOLARSHIP_PROGRAM_SETTINGS;
    }

    const rows =
      (await response.json()) as Partial<ScholarshipProgramSetting>[];
    return mergeScholarshipProgramSettings(rows);
  } catch {
    return DEFAULT_SCHOLARSHIP_PROGRAM_SETTINGS;
  }
}
