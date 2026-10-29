"use client";

import type { ReactElement } from "react";
import { Stack, ToggleButton, ToggleButtonGroup } from "@mui/material";
import type { NotificationType } from "@/api/types/notification";
import { SelectField } from "@/components/ui/inputs";

interface NotificationFiltersProps {
  readFilter: "all" | "read" | "unread";
  typeFilter: NotificationType | null;
  onReadFilterChange: (value: "all" | "read" | "unread") => void;
  onTypeFilterChange: (value: NotificationType | null) => void;
}

const NOTIFICATION_TYPES = [
  { value: "", label: "All types" },
  { value: "VULNERABILITY_FOUND", label: "Vulnerabilities" },
  { value: "GIT_SECRET_DETECTION", label: "Git Secret Detection" },
  { value: "ROLE_CHANGE", label: "Role Changes" },
];

export function NotificationFilters(props: NotificationFiltersProps): ReactElement {
  const { readFilter, typeFilter, onReadFilterChange, onTypeFilterChange } = props;

  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <ToggleButtonGroup
        value={readFilter}
        exclusive
        onChange={(_, value) => {
          if (value !== null) onReadFilterChange(value);
        }}
        size="small"
      >
        <ToggleButton value="all">All</ToggleButton>
        <ToggleButton value="unread">Unread</ToggleButton>
        <ToggleButton value="read">Read</ToggleButton>
      </ToggleButtonGroup>
      <SelectField
        value={typeFilter ?? ""}
        onChange={(v) => onTypeFilterChange((v || null) as NotificationType | null)}
        options={NOTIFICATION_TYPES}
        label="Type"
        minWidth={180}
      />
    </Stack>
  );
}
