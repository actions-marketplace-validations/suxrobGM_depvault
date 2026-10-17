"use client";

import { type ReactElement, useState } from "react";
import {
  Add as AddIcon,
  Download as DownloadIcon,
  Gavel as LicenseIcon,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useLicenseCompliance } from "@/api/queries/licenses";
import { useProjectRole } from "@/api/queries/projects";
import { CreateAnalysisDialog } from "@/components/features/projects/analysis/create-analysis-dialog";
import { PaginationBar } from "@/components/ui/data-display";
import { EmptyState } from "@/components/ui/feedback";
import { SearchField } from "@/components/ui/inputs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { API_BASE_URL } from "@/lib/constants";
import { ProjectSubpageHeader } from "../project-subpage-header";
import { ComplianceSummaryStats } from "./compliance-summary-stats";
import { LicenseRulesTable } from "./license-rules-table";

interface LicenseTabProps {
  projectId: string;
}

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

const POLICY_COLOR: Record<string, "success" | "warning" | "error" | "default"> = {
  ALLOW: "success",
  WARN: "warning",
  BLOCK: "error",
};

/** Main license compliance tab combining summary, dependency list, rules, and export. */
export function LicenseTab(props: LicenseTabProps): ReactElement {
  const { projectId } = props;
  const { canEdit } = useProjectRole(projectId);
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const { data: compliance, isLoading } = useLicenseCompliance(projectId, {
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch,
  });

  const handleExport = (format: "csv" | "txt") => {
    window.open(
      `${API_BASE_URL}/api/projects/${projectId}/license-rules/export?format=${format}`,
      "_blank",
    );
  };

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={300} height={40} sx={{ mb: 1 }} />
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  return (
    <Box>
      <ProjectSubpageHeader
        projectId={projectId}
        title="License Compliance"
        actions={
          <Stack direction="row" spacing={1}>
            {canEdit && (
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setCreateDialogOpen(true)}
              >
                New Analysis
              </Button>
            )}
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={() => handleExport("csv")}
            >
              CSV
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={() => handleExport("txt")}
            >
              TXT
            </Button>
          </Stack>
        }
      />
      {compliance && (
        <ComplianceSummaryStats
          total={compliance.total}
          allowed={compliance.allowed}
          warned={compliance.warned}
          blocked={compliance.blocked}
        />
      )}
      <Box sx={{ mb: 4 }}>
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Typography variant="subtitle1">Dependency Licenses</Typography>
          <SearchField
            placeholder="Search dependencies..."
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            sx={{ width: 260 }}
          />
        </Stack>

        {!compliance?.dependencies.length ? (
          <EmptyState
            icon={<LicenseIcon />}
            title="No dependencies found"
            description="Run an analysis to see license compliance data for your project's dependencies."
          />
        ) : (
          <TableContainer
            sx={{
              borderRadius: 2,
              border: 1,
              borderColor: "divider",
              bgcolor: (t) => alpha(t.palette.background.paper, 0.3),
              backdropFilter: "blur(8px)",
            }}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Package</TableCell>
                  <TableCell>Analysis</TableCell>
                  <TableCell>License</TableCell>
                  <TableCell sx={{ width: 120 }}>Policy</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {compliance?.dependencies.map((dep) => (
                  <TableRow key={dep.name}>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 500,
                        }}
                      >
                        {dep.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2Muted">{dep.analysisFileName}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{dep.license ?? "Unknown"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={dep.licensePolicy}
                        size="small"
                        color={POLICY_COLOR[dep.licensePolicy] ?? "default"}
                        variant="outlined"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {compliance && compliance.pagination.totalPages > 1 && (
          <PaginationBar count={compliance.pagination.totalPages} page={page} onChange={setPage} />
        )}
      </Box>
      <LicenseRulesTable projectId={projectId} canEdit={canEdit} />
      <CreateAnalysisDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        projectId={projectId}
      />
    </Box>
  );
}
