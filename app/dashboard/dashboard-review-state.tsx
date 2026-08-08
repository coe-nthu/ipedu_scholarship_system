"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { toast } from "sonner";

import type { ReviewStatus, ScholarshipApplication } from "@/lib/types";

/**
 * Shared mutable dashboard state.
 *
 * The dashboard renders one `DashboardTable` for the 「全部」 tab and one more
 * per scholarship program, and Base UI `Tabs.Panel` unmounts inactive panels.
 * When each table owned its own state, switching tabs remounted the table and
 * re-seeded it from the page-load props — a review status saved a moment ago
 * appeared to revert to 「未審核」 even though the database was correct.
 *
 * Keeping the state in a provider above the tabs means every table reads and
 * writes the same maps and nothing is lost on remount.
 *
 * All maps hold *local overrides only*. Reads fall back to the value coming
 * from the server component, so a fresh page load always wins.
 */
type DashboardReviewState = {
  appOverrides: Record<string, ScholarshipApplication>;
  deletedIds: Set<string>;
  remarks: Record<string, string>;
  reviewStatuses: Record<string, ReviewStatus>;
  sortOrders: Record<string, number>;
  handleRemarkChange: (id: string, value: string) => void;
  handleReviewStatusChange: (id: string, status: ReviewStatus) => void;
  handleSortOrderChange: (id: string, value: number) => void;
  markDeleted: (id: string) => void;
  applyUpdatedApplication: (updated: ScholarshipApplication) => void;
};

const DashboardReviewStateContext = createContext<DashboardReviewState | null>(
  null
);

export function useDashboardReviewState() {
  const value = useContext(DashboardReviewStateContext);
  if (!value) {
    throw new Error(
      "useDashboardReviewState must be used inside <DashboardReviewStateProvider>."
    );
  }
  return value;
}

export function DashboardReviewStateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Records the admin has deleted this session, hidden from the list.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());

  // Payload edits made in the detail Sheet are reflected here so the list and
  // the open detail view stay in sync without a full refetch.
  const [appOverrides, setAppOverrides] = useState<
    Record<string, ScholarshipApplication>
  >({});

  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [sortOrders, setSortOrders] = useState<Record<string, number>>({});
  const [reviewStatuses, setReviewStatuses] = useState<
    Record<string, ReviewStatus>
  >({});

  const applyUpdatedApplication = useCallback(
    (updated: ScholarshipApplication) => {
      setAppOverrides((prev) => ({ ...prev, [updated.id]: updated }));
      setRemarks((prev) => ({
        ...prev,
        [updated.id]: updated.reviewer_remarks ?? "",
      }));
      setSortOrders((prev) => ({
        ...prev,
        [updated.id]: updated.review_sort_order ?? 0,
      }));
      setReviewStatuses((prev) => ({
        ...prev,
        [updated.id]: updated.review_status,
      }));
    },
    []
  );

  const markDeleted = useCallback((id: string) => {
    setDeletedIds((prev) => new Set(prev).add(id));
  }, []);

  // Optimistic remark update with API persistence
  const handleRemarkChange = useCallback((id: string, value: string) => {
    setRemarks((prev) => ({ ...prev, [id]: value }));

    fetch("/api/dashboard", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ applicationId: id, reviewer_remarks: value }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("儲存備註失敗");
      })
      .catch(() => {
        toast.error("備註儲存失敗，請重試。");
      });
  }, []);

  const handleSortOrderChange = useCallback((id: string, value: number) => {
    let previousValue = 0;
    setSortOrders((prev) => {
      previousValue = prev[id] ?? 0;
      return { ...prev, [id]: value };
    });

    fetch("/api/dashboard", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ applicationId: id, review_sort_order: value }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("儲存排序失敗");
      })
      .catch(() => {
        setSortOrders((p) => ({ ...p, [id]: previousValue }));
        toast.error("排序儲存失敗，請重試。");
      });
  }, []);

  const handleReviewStatusChange = useCallback(
    async (id: string, status: ReviewStatus) => {
      let previousStatus: ReviewStatus | undefined;
      setReviewStatuses((prev) => {
        previousStatus = prev[id];
        return { ...prev, [id]: status };
      });

      try {
        const res = await fetch("/api/dashboard", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ applicationId: id, review_status: status }),
        });
        const data = (await res.json().catch(() => null)) as {
          application?: ScholarshipApplication;
          error?: string;
          success?: boolean;
        } | null;

        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "更新審查狀態失敗");
        }

        // Trust what the database actually returned rather than the optimistic
        // value, so a rejected or coerced write can never look like a success.
        if (data.application) {
          applyUpdatedApplication(data.application);
        }
      } catch (error) {
        setReviewStatuses((p) => {
          const next = { ...p };
          if (previousStatus === undefined) {
            delete next[id];
          } else {
            next[id] = previousStatus;
          }
          return next;
        });
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : "審查狀態更新失敗，請重試。"
        );
      }
    },
    [applyUpdatedApplication]
  );

  const value = useMemo<DashboardReviewState>(
    () => ({
      appOverrides,
      deletedIds,
      remarks,
      reviewStatuses,
      sortOrders,
      handleRemarkChange,
      handleReviewStatusChange,
      handleSortOrderChange,
      markDeleted,
      applyUpdatedApplication,
    }),
    [
      appOverrides,
      deletedIds,
      remarks,
      reviewStatuses,
      sortOrders,
      handleRemarkChange,
      handleReviewStatusChange,
      handleSortOrderChange,
      markDeleted,
      applyUpdatedApplication,
    ]
  );

  return (
    <DashboardReviewStateContext.Provider value={value}>
      {children}
    </DashboardReviewStateContext.Provider>
  );
}
