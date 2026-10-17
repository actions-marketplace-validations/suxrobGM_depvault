"use client";

import type { ReactElement } from "react";
import { type CiTokenMaterial, createCiTokenMaterial } from "@depvault/crypto";
import { DialogContent, Link, Stack, Typography } from "@mui/material";
import NextLink from "next/link";
import { z } from "zod/v4";
import { useCreateCiToken } from "@/api/queries/project-access";
import { useAppForm } from "@/components/ui/form";
import { useSubscription } from "@/hooks/use-subscription";
import { useToast } from "@/hooks/use-toast";
import { useVault } from "@/hooks/use-vault";
import { ROUTES } from "@/lib/constants";
import { describeKeyError } from "@/lib/crypto/errors";

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

/** The full token, assembled client-side and never returned by the server. */
export interface CreatedCiToken {
  token: string;
  expiresAt: string | Date;
}

interface CiTokenFormProps {
  projectId: string;
  /** IP allowlists follow the owner's plan, which is only known when the viewer is the owner. */
  isOwner: boolean;
  onCreated: (token: CreatedCiToken) => void;
  onCancel: () => void;
}

/** Name, file scope, expiry and IP allowlist of a new CI token; generates the token locally. */
export function CiTokenForm(props: CiTokenFormProps): ReactElement {
  const { projectId, isOwner, onCreated, onCancel } = props;
  const { getProjectDEK } = useVault();
  const { limits } = useSubscription();
  const toast = useToast();
  const mutation = useCreateCiToken(projectId);

  const ipAllowlistLocked = isOwner && limits !== null && !limits.ipAllowlists;

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

      let material: CiTokenMaterial;
      try {
        material = await createCiTokenMaterial(await getProjectDEK(projectId));
      } catch (err) {
        toast.error(describeKeyError(err, "Couldn't read this project's encryption key."));
        return;
      }

      const { fullToken, ...tokenFields } = material;
      try {
        const created = await mutation.mutateAsync({
          name: value.name.trim(),
          paths: value.paths,
          expiresIn: Math.min(expiresIn, 365 * DAY),
          ...tokenFields,
          ...(ipAllowlist.length > 0 && { ipAllowlist }),
        });
        onCreated({ token: fullToken, expiresAt: created.expiresAt });
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
    <form.AppForm>
      <form.Form>
        <DialogContent>
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
        </DialogContent>
        <form.DialogFormActions
          onCancel={onCancel}
          submitLabel="Generate Token"
          pendingLabel="Generating..."
        />
      </form.Form>
    </form.AppForm>
  );
}
