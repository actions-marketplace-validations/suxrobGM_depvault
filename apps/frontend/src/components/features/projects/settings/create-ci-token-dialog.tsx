"use client";

import { type ReactElement, useState } from "react";
import {
  deriveCIWrapKey,
  exportDEK,
  generateCiToken,
  hashCiBearerToken,
  wrapKey,
} from "@depvault/crypto";
import { Key as KeyIcon } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import NextLink from "next/link";
import { z } from "zod/v4";
import { client } from "@/api/client";
import { useApiMutation } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { CreateCiTokenBody } from "@/api/types/ci-token";
import { VaultGate } from "@/components/features/vault";
import { useAppForm } from "@/components/ui/form";
import { CopyButton } from "@/components/ui/inputs";
import { useSubscription } from "@/hooks/use-subscription";
import { useVault } from "@/hooks/use-vault";
import { ROUTES } from "@/lib/constants";
import { CiTokenUsageSnippets } from "./ci-token-usage-snippets";

const CUSTOM_VALUE = -1;
const DAY = 86400;

const EXPIRY_OPTIONS = [
  { label: "1 hour", value: 3600 },
  { label: "24 hours", value: DAY },
  { label: "7 days", value: 7 * DAY },
  { label: "30 days", value: 30 * DAY },
  { label: "90 days", value: 90 * DAY },
  { label: "1 year", value: 365 * DAY },
  { label: "Custom", value: CUSTOM_VALUE },
];

const IP_OR_CIDR = /^[0-9a-fA-F:.]+(\/\d{1,3})?$/;

const ciTokenSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100, "At most 100 characters"),
    paths: z
      .array(z.string().min(1).max(256, "Each pattern must be at most 256 characters"))
      .max(20, "At most 20 path patterns"),
    expiresIn: z.number(),
    customDate: z.string(),
    ipAllowlistText: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.expiresIn === CUSTOM_VALUE) {
      const days = (new Date(value.customDate).getTime() - Date.now()) / 1000 / DAY;
      if (!value.customDate || Number.isNaN(days) || days <= 0 || days > 366) {
        ctx.addIssue({
          code: "custom",
          path: ["customDate"],
          message: "Pick a date within the next year",
        });
      }
    }
    const invalidIp = parseIpList(value.ipAllowlistText).find((ip) => !IP_OR_CIDR.test(ip));
    if (invalidIp) {
      ctx.addIssue({
        code: "custom",
        path: ["ipAllowlistText"],
        message: `"${invalidIp}" is not an IP address or CIDR range`,
      });
    }
  });

function parseIpList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function toDateInput(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

/** Local view model: the full token is assembled client-side and never returned by the server. */
interface CreatedTokenView {
  token: string;
  expiresAt: string | Date;
}

interface CreateCiTokenDialogProps {
  projectId: string;
  /** IP allowlists follow the owner's plan, which is only known when the viewer is the owner. */
  isOwner: boolean;
  onClose: () => void;
}

export function CreateCiTokenDialog(props: CreateCiTokenDialogProps): ReactElement {
  const { projectId, isOwner, onClose } = props;
  const { getProjectDEK, isVaultUnlocked } = useVault();
  const { limits } = useSubscription();
  const [createdToken, setCreatedToken] = useState<CreatedTokenView | null>(null);

  const ipAllowlistLocked = isOwner && limits !== null && !limits.ipAllowlists;

  const mutation = useApiMutation(
    (values: CreateCiTokenBody) => client.api.projects({ id: projectId })["ci-tokens"].post(values),
    {
      invalidateKeys: [queryKeys.ciTokens.byProject(projectId)],
      errorMessage: (error) => error.message || "Failed to create CI token",
    },
  );

  const form = useAppForm({
    defaultValues: {
      name: "",
      paths: [] as string[],
      expiresIn: 30 * DAY,
      customDate: "",
      ipAllowlistText: "",
    },
    validators: { onSubmit: ciTokenSchema },
    onSubmit: async ({ value }) => {
      const ipAllowlist = ipAllowlistLocked ? [] : parseIpList(value.ipAllowlistText);
      const expiresIn =
        value.expiresIn === CUSTOM_VALUE
          ? Math.max(3600, Math.ceil((new Date(value.customDate).getTime() - Date.now()) / 1000))
          : value.expiresIn;

      const dek = await getProjectDEK(projectId);
      const dekBytes = await exportDEK(dek);

      // The token is generated locally: the server gets only the auth-part hash and a DEK
      // wrapped under the key part, so it can authenticate the token but never unwrap the DEK.
      const ciToken = generateCiToken();
      const tokenWrapKey = await deriveCIWrapKey(ciToken.keyPart);
      const wrapped = await wrapKey(dekBytes, tokenWrapKey);
      const tokenHash = await hashCiBearerToken(ciToken.bearerToken);

      try {
        const created = await mutation.mutateAsync({
          name: value.name.trim(),
          paths: value.paths,
          expiresIn: Math.min(expiresIn, 365 * DAY),
          tokenHash,
          tokenPrefix: ciToken.tokenPrefix,
          wrappedDek: wrapped.wrapped,
          wrappedDekIv: wrapped.iv,
          wrappedDekTag: wrapped.tag,
          ...(ipAllowlist.length > 0 && { ipAllowlist }),
        });
        setCreatedToken({ token: ciToken.fullToken, expiresAt: created.expiresAt });
      } catch {
        // Toasted by the mutation.
      }
    },
  });

  const now = new Date();
  const maxDate = new Date(now);
  maxDate.setFullYear(now.getFullYear() + 1);
  const minDate = new Date(now.getTime() + DAY * 1000);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <KeyIcon fontSize="small" />
        Generate CI/CD Token
      </DialogTitle>
      <DialogContent>
        {!isVaultUnlocked ? (
          <Box sx={{ mt: 1 }}>
            <VaultGate description="The token carries a copy of this project's key, so your vault must be unlocked to create it." />
          </Box>
        ) : createdToken ? (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="warning">Copy this token now. It will not be shown again.</Alert>
            <Box
              sx={{
                p: 1.5,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                fontFamily: "monospace",
                fontSize: "0.8rem",
                wordBreak: "break-all",
                bgcolor: "action.hover",
              }}
            >
              {createdToken.token}
            </Box>
            <CopyButton
              value={createdToken.token}
              label="Copy Token"
              notification="Token copied to clipboard"
              fullWidth
            />
            <Typography variant="captionMuted">
              Expires: {new Date(createdToken.expiresAt).toLocaleString()}. Save it as the
              DEPVAULT_TOKEN secret of your pipeline:
            </Typography>
            <CiTokenUsageSnippets />
          </Stack>
        ) : (
          <form
            id="create-ci-token"
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              <form.AppField name="name">
                {(field) => (
                  <field.TextField label="Token name" placeholder="GitHub deploy" autoFocus />
                )}
              </form.AppField>
              <form.AppField name="paths">
                {(field) => (
                  <field.ChipsField
                    label="Files (optional)"
                    placeholder="Type a path or glob and press Enter"
                    helperText="Matched from the repo root: deploy/**, apps/api/.env, or **/.env for any depth. Leave empty for all files."
                  />
                )}
              </form.AppField>
              <form.AppField name="expiresIn">
                {(field) => <field.Select label="Expires after" items={EXPIRY_OPTIONS} />}
              </form.AppField>
              <form.Subscribe selector={(state) => state.values.expiresIn}>
                {(expiresIn) =>
                  expiresIn === CUSTOM_VALUE && (
                    <form.AppField name="customDate">
                      {(field) => (
                        <field.TextField
                          label="Expiration date"
                          type="date"
                          slotProps={{
                            htmlInput: { min: toDateInput(minDate), max: toDateInput(maxDate) },
                            inputLabel: { shrink: true },
                          }}
                        />
                      )}
                    </form.AppField>
                  )
                }
              </form.Subscribe>
              <Stack spacing={0.5}>
                <form.AppField name="ipAllowlistText">
                  {(field) => (
                    <field.TextField
                      label="IP allowlist (optional)"
                      placeholder={"10.0.0.1\n192.168.1.0/24"}
                      multiline
                      rows={3}
                      disabled={ipAllowlistLocked}
                    />
                  )}
                </form.AppField>
                <Typography variant="captionMuted">
                  {ipAllowlistLocked ? (
                    <>
                      IP allowlists are part of the Team plan.{" "}
                      <Link component={NextLink} href={ROUTES.billing}>
                        Upgrade
                      </Link>
                    </>
                  ) : isOwner ? (
                    "One IP address or CIDR range per line. Leave empty to allow any IP."
                  ) : (
                    "One IP address or CIDR range per line. Requires the project owner's Team plan."
                  )}
                </Typography>
              </Stack>
            </Stack>
          </form>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {createdToken || !isVaultUnlocked ? (
          <Button onClick={onClose}>{createdToken ? "Done" : "Close"}</Button>
        ) : (
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <>
                <Button onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="create-ci-token"
                  variant="contained"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Generating..." : "Generate Token"}
                </Button>
              </>
            )}
          </form.Subscribe>
        )}
      </DialogActions>
    </Dialog>
  );
}
