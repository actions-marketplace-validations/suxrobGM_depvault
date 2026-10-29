"use client";

import { type ReactElement, useState } from "react";
import {
  Check as CheckIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  AccountTree as GraphIcon,
  Refresh as RescanIcon,
  TableChart as TableIcon,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import {
  useAnalysis,
  useDeleteAnalysis,
  useRescanAnalysis,
  useUpdateAnalysisPath,
} from "@/api/queries/analyses";
import { useProjectRole } from "@/api/queries/projects";
import { StatusBadge } from "@/components/ui/data-display";
import { useConfirm } from "@/hooks/use-confirm";
import { ROUTES } from "@/lib/constants";
import { ProjectSubpageHeader } from "../project-subpage-header";
import { AnalysisSummaryStats } from "./analysis-summary-stats";
import { DependencyDataGrid } from "./dependency-data-grid";
import { DependencyGraph } from "./dependency-graph";
import { getEcosystemLabel, getHealthColor } from "./utils";

interface AnalysisDetailPageProps {
  projectId: string;
  analysisId: string;
}

type ViewMode = "table" | "graph";

export function AnalysisDetailView(props: AnalysisDetailPageProps): ReactElement {
  const { projectId, analysisId } = props;
  const router = useRouter();
  const { canEdit } = useProjectRole(projectId);
  const confirm = useConfirm();

  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [editingPath, setEditingPath] = useState(false);
  const [filePathDraft, setFilePathDraft] = useState("");

  const { data: analysis, isLoading } = useAnalysis(projectId, analysisId);

  const deleteMutation = useDeleteAnalysis(projectId, {
    onSuccess: () => router.push(ROUTES.projectAnalysis(projectId)),
  });
  const updateMutation = useUpdateAnalysisPath(projectId, analysisId, {
    onSuccess: () => setEditingPath(false),
  });
  const rescanMutation = useRescanAnalysis(projectId, analysisId);

  const handleDeleteAnalysis = async () => {
    const confirmed = await confirm({
      title: "Delete Analysis",
      description:
        "Are you sure you want to delete this analysis? This will remove all dependency data and cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (confirmed) {
      deleteMutation.mutate(analysisId);
    }
  };

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={300} height={40} sx={{ mb: 1 }} />
        <Skeleton variant="text" width={200} height={24} sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={400} />
      </Box>
    );
  }

  if (!analysis) {
    return (
      <Stack
        sx={{
          alignItems: "center",
          py: 6,
        }}
      >
        <Typography variant="body1Muted">Analysis not found</Typography>
        <Button onClick={() => router.push(ROUTES.projectAnalysis(projectId))} sx={{ mt: 2 }}>
          Back to analyses
        </Button>
      </Stack>
    );
  }

  const displayName = analysis.filePath ?? analysis.fileName;

  return (
    <Box>
      <ProjectSubpageHeader
        projectId={projectId}
        title={displayName}
        trail={[{ label: "Analysis", href: ROUTES.projectAnalysis(projectId) }]}
        actions={
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
            }}
          >
            {canEdit && (
              <Tooltip title="Rescan dependencies">
                <IconButton
                  size="small"
                  onClick={() => rescanMutation.mutate()}
                  disabled={rescanMutation.isPending}
                >
                  {rescanMutation.isPending ? (
                    <CircularProgress size={18} />
                  ) : (
                    <RescanIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
            )}
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, v) => v && setViewMode(v)}
              size="small"
            >
              <ToggleButton value="table" aria-label="Table view">
                <Tooltip title="Table view">
                  <TableIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="graph" aria-label="Graph view">
                <Tooltip title="Graph view">
                  <GraphIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
            {canEdit && (
              <Tooltip title="Delete analysis">
                <IconButton color="error" onClick={handleDeleteAnalysis} size="small">
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        }
      />
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: "center",
          mb: 3,
        }}
      >
        <Chip label={getEcosystemLabel(analysis.ecosystem)} size="small" variant="outlined" />
        <StatusBadge
          label={analysis.healthScore !== null ? `${analysis.healthScore}%` : "Pending"}
          variant={getHealthColor(analysis.healthScore)}
          glow
        />
        <Typography variant="captionMuted">
          {new Date(analysis.createdAt).toLocaleString()} &middot; {analysis.dependencies.length}{" "}
          dependencies
        </Typography>
      </Stack>
      {canEdit && (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: "center",
            mb: 2,
          }}
        >
          {editingPath ? (
            <>
              <TextField
                size="small"
                placeholder="e.g., packages/api/package.json"
                value={filePathDraft}
                onChange={(e) => setFilePathDraft(e.target.value)}
                sx={{ width: 360 }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateMutation.mutate({ filePath: filePathDraft || null });
                  } else if (e.key === "Escape") {
                    setEditingPath(false);
                  }
                }}
              />
              <IconButton
                size="small"
                color="primary"
                aria-label="Save file path"
                onClick={() => updateMutation.mutate({ filePath: filePathDraft || null })}
                disabled={updateMutation.isPending}
              >
                <CheckIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                aria-label="Cancel editing file path"
                onClick={() => setEditingPath(false)}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </>
          ) : (
            <Tooltip title="Edit file path">
              <IconButton
                size="small"
                onClick={() => {
                  setFilePathDraft(analysis.filePath ?? "");
                  setEditingPath(true);
                }}
              >
                <EditIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      )}
      <AnalysisSummaryStats
        dependencies={analysis.dependencies}
        healthScore={analysis.healthScore}
      />
      {viewMode === "table" ? (
        <DependencyDataGrid dependencies={analysis.dependencies} ecosystem={analysis.ecosystem} />
      ) : (
        <DependencyGraph dependencies={analysis.dependencies} fileName={displayName} />
      )}
    </Box>
  );
}
