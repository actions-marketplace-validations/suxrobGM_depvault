"use client";

import { type ReactElement, useState } from "react";
import { SubscriptionPlanName } from "@depvault/shared/constants";
import { displayName } from "@depvault/shared/utils";
import { Group as GroupIcon } from "@mui/icons-material";
import {
  Box,
  Chip,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { useAdminUsers } from "@/api/queries/admin";
import { PaginationBar, SkeletonList, StatusBadge } from "@/components/ui/data-display";
import { EmptyState } from "@/components/ui/feedback";
import { SearchField, SelectField } from "@/components/ui/inputs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PAGINATION_DEFAULTS, PLAN_VARIANT } from "@/lib/constants";
import { UserDetailDialog } from "./user-detail-dialog";

type PlanFilter = "FREE" | "PRO" | "TEAM";

const SEARCH_DEBOUNCE_MS = 300;

export function UsersTable(): ReactElement {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION_DEFAULTS.limit);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanFilter | "ALL">("ALL");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const { data, isLoading } = useAdminUsers({
    page,
    pageSize,
    search: debouncedSearch,
    plan: planFilter,
  });

  const users = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: "wrap", gap: 2 }}>
        <SearchField
          placeholder="Search by name or email..."
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          sx={{ minWidth: { xs: "100%", sm: 300 } }}
        />
        <SelectField
          value={planFilter}
          onChange={(v) => {
            setPlanFilter(v as PlanFilter | "ALL");
            setPage(1);
          }}
          options={[
            { value: "ALL", label: "All Plans" },
            { value: SubscriptionPlanName.FREE, label: "Free" },
            { value: SubscriptionPlanName.PRO, label: "Pro" },
            { value: SubscriptionPlanName.TEAM, label: "Team" },
          ]}
        />
      </Stack>

      {isLoading && <SkeletonList count={6} height={48} />}
      {!isLoading && users.length === 0 && (
        <EmptyState icon={<GroupIcon />} title="No users found" />
      )}
      {!isLoading && users.length > 0 && (
        <>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Plan</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Comp</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => {
                  const plan = user.subscription?.plan ?? SubscriptionPlanName.FREE;
                  const status = user.subscription?.status ?? "—";
                  const isComp = user.subscription?.isComp ?? false;
                  const name = displayName(user, "—");

                  return (
                    <TableRow
                      key={user.id}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      <TableCell>
                        {/* The row is clickable for mouse users; this button is the keyboard target. */}
                        <Link
                          component="button"
                          type="button"
                          underline="hover"
                          color="inherit"
                          aria-label={`Open details for ${user.email}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUserId(user.id);
                          }}
                        >
                          {name}
                        </Link>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <StatusBadge label={plan} variant={PLAN_VARIANT[plan] ?? "default"} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={status}
                          variant={status === "ACTIVE" ? "success" : "default"}
                        />
                      </TableCell>
                      <TableCell>
                        {isComp && (
                          <Chip label="Comp" size="small" color="warning" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {pagination && (
            <PaginationBar
              count={pagination.totalPages}
              page={page}
              onChange={setPage}
              total={pagination.total}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
            />
          )}
        </>
      )}

      <UserDetailDialog
        open={selectedUserId !== null}
        onClose={() => setSelectedUserId(null)}
        userId={selectedUserId}
      />
    </Box>
  );
}
