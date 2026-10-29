"use client";

import { type ReactElement, useState } from "react";
import { History as HistoryIcon } from "@mui/icons-material";
import { Box } from "@mui/material";
import { useGlobalActivity } from "@/api/queries/activity";
import { ActivityLogEntry } from "@/components/features/projects/activity/activity-log-entry";
import { PaginationBar, SkeletonList } from "@/components/ui/data-display";
import { EmptyState } from "@/components/ui/feedback";
import { ActivityUpgradeGate } from "./activity-upgrade-gate";
import {
  EMPTY_FILTERS,
  GlobalActivityFilterBar,
  type GlobalActivityFilters,
} from "./global-activity-filter-bar";

const PAGE_SIZE = 20;

export function GlobalActivityView(): ReactElement {
  const [filters, setFilters] = useState<GlobalActivityFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useGlobalActivity({ ...filters, page, pageSize: PAGE_SIZE });

  const handleFiltersChange = (newFilters: GlobalActivityFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== "");
  const totalPages = data ? Math.ceil(data.pagination.total / PAGE_SIZE) : 0;

  return (
    <ActivityUpgradeGate>
      <Box>
        <GlobalActivityFilterBar filters={filters} onFiltersChange={handleFiltersChange} />

        {isLoading && <SkeletonList />}
        {!isLoading && (!data || data.items.length === 0) && (
          <EmptyState
            icon={<HistoryIcon />}
            title="No activity found"
            description={
              hasActiveFilters
                ? "Try adjusting your filters to find what you're looking for."
                : "Activity will appear here as you and your team interact with projects."
            }
          />
        )}
        {!isLoading && data && data.items.length > 0 && (
          <Box sx={{ pl: { xs: 0, sm: 1 } }}>
            {data.items.map((entry, index) => (
              <ActivityLogEntry
                key={entry.id}
                entry={entry}
                index={index}
                isLast={index === data.items.length - 1}
                projectName={entry.projectName}
              />
            ))}

            {totalPages > 1 && <PaginationBar count={totalPages} page={page} onChange={setPage} />}
          </Box>
        )}
      </Box>
    </ActivityUpgradeGate>
  );
}
