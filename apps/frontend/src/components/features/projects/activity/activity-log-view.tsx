"use client";

import { type ReactElement, useState } from "react";
import { History as HistoryIcon } from "@mui/icons-material";
import { Box } from "@mui/material";
import { useAuditLog } from "@/api/queries/activity";
import { ActivityUpgradeGate } from "@/components/features/dashboard/activity/activity-upgrade-gate";
import { PaginationBar, SkeletonList } from "@/components/ui/data-display";
import { EmptyState } from "@/components/ui/feedback";
import { ActivityFilterBar, type ActivityFilters, EMPTY_FILTERS } from "./activity-filter-bar";
import { ActivityLogEntry } from "./activity-log-entry";

interface ActivityLogViewProps {
  projectId: string;
}

const PAGE_SIZE = 20;

export function ActivityLogView(props: ActivityLogViewProps): ReactElement {
  const { projectId } = props;
  const [filters, setFilters] = useState<ActivityFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAuditLog(projectId, { ...filters, page, pageSize: PAGE_SIZE });

  const handleFiltersChange = (newFilters: ActivityFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== "");
  const totalPages = data ? Math.ceil(data.pagination.total / PAGE_SIZE) : 0;

  return (
    <ActivityUpgradeGate>
      <Box>
        <ActivityFilterBar filters={filters} onFiltersChange={handleFiltersChange} />

        {isLoading ? (
          <SkeletonList />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<HistoryIcon />}
            title="No activity found"
            description={
              hasActiveFilters
                ? "Try adjusting your filters to find what you're looking for."
                : "Activity will appear here as team members interact with the project vault."
            }
          />
        ) : (
          <Box sx={{ pl: { xs: 0, sm: 1 } }}>
            {data.items.map((entry, index) => (
              <ActivityLogEntry
                key={entry.id}
                entry={entry}
                index={index}
                isLast={index === data.items.length - 1}
              />
            ))}

            {totalPages > 1 && <PaginationBar count={totalPages} page={page} onChange={setPage} />}
          </Box>
        )}
      </Box>
    </ActivityUpgradeGate>
  );
}
