"use client";

import { type ReactElement, useState } from "react";
import {
  RemoveCircleOutlined as FalsePositiveIcon,
  CheckCircle as ResolveIcon,
} from "@mui/icons-material";
import {
  Box,
  Button,
  CardContent,
  Checkbox,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  useBatchUpdateDetections,
  useDetections,
  useUpdateDetection,
} from "@/api/queries/secret-scanning";
import type { DetectionDto, PatternDto } from "@/api/types/secret-scan";
import { Surface } from "@/components/ui/cards";
import { PaginationBar } from "@/components/ui/data-display";
import { EmptyState } from "@/components/ui/feedback";
import { DetectionTableRow } from "./detection-table-row";

interface DetectionsTableProps {
  projectId: string;
  /** Viewers can read detections but not triage them. */
  canEdit: boolean;
}

export function DetectionsTable(props: DetectionsTableProps): ReactElement {
  const { projectId, canEdit } = props;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<DetectionDto["status"] | "">("");
  const [severityFilter, setSeverityFilter] = useState<PatternDto["severity"] | "">("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useDetections(projectId, {
    page,
    pageSize,
    status: statusFilter,
    severity: severityFilter,
  });

  const updateStatus = useUpdateDetection(projectId);
  const batchUpdate = useBatchUpdateDetections(projectId, {
    onSuccess: () => setSelectedIds(new Set()),
  });

  const detections = data?.items ?? [];
  const openDetections = detections.filter((d) => d.status === "OPEN");

  const allOpenSelected =
    openDetections.length > 0 && openDetections.every((d) => selectedIds.has(d.id));

  const someSelected = selectedIds.size > 0;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(openDetections.map((d) => d.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelect = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelectedIds(next);
  };

  const handleBatchAction = (status: "RESOLVED" | "FALSE_POSITIVE") => {
    batchUpdate.mutate({ detectionIds: [...selectedIds], status });
  };

  return (
    <Surface>
      <CardContent>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 2 }}>
          <TextField
            select
            size="small"
            label="Status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as DetectionDto["status"] | "");
              setPage(1);
            }}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="OPEN">Open</MenuItem>
            <MenuItem value="RESOLVED">Resolved</MenuItem>
            <MenuItem value="FALSE_POSITIVE">False Positive</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Severity"
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value as PatternDto["severity"] | "");
              setPage(1);
            }}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="CRITICAL">Critical</MenuItem>
            <MenuItem value="HIGH">High</MenuItem>
            <MenuItem value="MEDIUM">Medium</MenuItem>
            <MenuItem value="LOW">Low</MenuItem>
          </TextField>

          {canEdit && someSelected && (
            <>
              <Box sx={{ flex: 1 }} />
              <Typography variant="body2Muted">{selectedIds.size} selected</Typography>
              <Button
                size="small"
                variant="outlined"
                color="success"
                startIcon={<ResolveIcon />}
                onClick={() => handleBatchAction("RESOLVED")}
                disabled={batchUpdate.isPending}
              >
                Resolve
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<FalsePositiveIcon />}
                onClick={() => handleBatchAction("FALSE_POSITIVE")}
                disabled={batchUpdate.isPending}
              >
                False Positive
              </Button>
            </>
          )}
        </Stack>
        {detections.length === 0 && !isLoading ? (
          <EmptyState
            title="No detections found"
            description="No secret detections match your current filters."
          />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {canEdit && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={allOpenSelected}
                        indeterminate={someSelected && !allOpenSelected}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        slotProps={{ input: { "aria-label": "Select all open detections" } }}
                      />
                    </TableCell>
                  )}
                  <TableCell width={40} />
                  <TableCell>Commit</TableCell>
                  <TableCell>File</TableCell>
                  <TableCell>Pattern</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Status</TableCell>
                  {canEdit && <TableCell align="right">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {detections.map((d) => (
                  <DetectionTableRow
                    key={d.id}
                    detection={d}
                    expanded={expandedId === d.id}
                    onToggle={() => setExpandedId(expandedId === d.id ? null : d.id)}
                    onResolve={() => updateStatus.mutate({ detectionId: d.id, status: "RESOLVED" })}
                    onFalsePositive={() =>
                      updateStatus.mutate({ detectionId: d.id, status: "FALSE_POSITIVE" })
                    }
                    isUpdating={updateStatus.isPending}
                    canEdit={canEdit}
                    selected={selectedIds.has(d.id)}
                    onSelect={(checked) => handleSelect(d.id, checked)}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {data && (
          <PaginationBar
            page={page}
            count={data.pagination.totalPages}
            onChange={setPage}
            total={data.pagination.total}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        )}
      </CardContent>
    </Surface>
  );
}
