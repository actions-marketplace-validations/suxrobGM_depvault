"use client";

import type { ReactElement, ReactNode } from "react";
import { Delete as DeleteIcon } from "@mui/icons-material";
import {
  CardContent,
  CardHeader,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { Surface } from "@/components/ui/cards";
import { useConfirm } from "@/hooks/use-confirm";
import { SkeletonList } from "./skeleton-list";

interface SectionTableColumn {
  label: string;
  align?: "left" | "right";
}

interface SectionTableProps {
  title: string;
  subheader?: ReactNode;
  /** Header actions, e.g. a "Generate" button. */
  action?: ReactNode;
  /** Falsy entries are skipped, so columns can be conditional. */
  columns: ReadonlyArray<SectionTableColumn | false>;
  isLoading: boolean;
  isEmpty: boolean;
  emptyText: ReactNode;
  /** The `TableRow`s. */
  children: ReactNode;
}

interface RevokeButtonProps {
  /** Accessible name, e.g. `Revoke deploy-token`. */
  label: string;
  confirmTitle: string;
  confirmDescription: string;
  onConfirm: () => void;
  disabled?: boolean;
}

/** Card with a title and a compact table, or a loading/empty state in its place. */
export function SectionTable(props: SectionTableProps): ReactElement {
  const { title, subheader, action, columns, isLoading, isEmpty, emptyText, children } = props;
  const visibleColumns = columns.filter((column) => column !== false);

  return (
    <Surface>
      <CardHeader title={title} subheader={subheader} action={action} />
      <CardContent sx={{ p: 3 }}>
        {isLoading ? (
          <SkeletonList count={2} height={40} spacing={1} />
        ) : isEmpty ? (
          <Typography variant="body2Muted" sx={{ py: 2, textAlign: "center" }}>
            {emptyText}
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {visibleColumns.map((column) => (
                    <TableCell key={column.label} align={column.align}>
                      {column.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>{children}</TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Surface>
  );
}

/** Trash icon button that asks for confirmation before revoking. */
export function RevokeButton(props: RevokeButtonProps): ReactElement {
  const { label, confirmTitle, confirmDescription, onConfirm, disabled } = props;
  const confirm = useConfirm();

  const handleClick = async () => {
    const ok = await confirm({
      title: confirmTitle,
      description: confirmDescription,
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (ok) onConfirm();
  };

  return (
    <Tooltip title="Revoke">
      <IconButton size="small" aria-label={label} disabled={disabled} onClick={handleClick}>
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}
