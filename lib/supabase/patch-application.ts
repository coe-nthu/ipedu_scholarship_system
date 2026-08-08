/**
 * PATCH a scholarship_applications row through PostgREST.
 *
 * Why this exists: writing an audit column that the production database has not
 * been migrated to yet makes *every* review action fail at the database layer.
 * That already happened once — see the write-up in
 * `supabase/add_review_audit_columns.sql` — and the visible symptom was a review
 * status that silently snapped back to 「未審核」.
 *
 * `reviewed_by_label` (supabase/add_review_actor_label.sql) is purely an audit
 * nicety, so it must never be able to block a review. If PostgREST reports the
 * column as missing, the write is retried without it and the review still lands.
 */

/** Columns that improve the audit trail but are never worth failing a write for. */
const OPTIONAL_AUDIT_COLUMNS = ["reviewed_by_label"] as const;

type PatchResult =
  | { ok: true; data: unknown[] }
  | { ok: false; status: number; detail: string };

function isMissingOptionalColumnError(detail: string) {
  // PostgREST reports an unknown column as PGRST204:
  //   {"code":"PGRST204","message":"Could not find the 'reviewed_by_label' ..."}
  return OPTIONAL_AUDIT_COLUMNS.some((column) => detail.includes(column));
}

export async function patchScholarshipApplication({
  applicationId,
  fields,
  returnRepresentation = false,
  serviceRoleKey,
  url,
}: {
  applicationId: string;
  fields: Record<string, unknown>;
  returnRepresentation?: boolean;
  serviceRoleKey: string;
  url: string;
}): Promise<PatchResult> {
  const send = (body: Record<string, unknown>) =>
    fetch(`${url}/rest/v1/scholarship_applications?id=eq.${applicationId}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        ...(returnRepresentation ? { prefer: "return=representation" } : {}),
      },
      body: JSON.stringify(body),
    });

  const readData = async (response: Response) => {
    if (!returnRepresentation) return [];
    return (await response.json().catch(() => [])) as unknown[];
  };

  let response = await send(fields);
  if (response.ok) {
    return { ok: true, data: await readData(response) };
  }

  let detail = await response.text().catch(() => "");
  const usedOptionalColumn = OPTIONAL_AUDIT_COLUMNS.some(
    (column) => column in fields
  );

  if (usedOptionalColumn && isMissingOptionalColumnError(detail)) {
    console.warn(
      "Retrying application PATCH without audit columns; run supabase/add_review_actor_label.sql to enable the review audit trail."
    );
    const retryFields = { ...fields };
    for (const column of OPTIONAL_AUDIT_COLUMNS) {
      delete retryFields[column];
    }

    response = await send(retryFields);
    if (response.ok) {
      return { ok: true, data: await readData(response) };
    }
    detail = await response.text().catch(() => "");
  }

  return { ok: false, status: response.status, detail };
}
