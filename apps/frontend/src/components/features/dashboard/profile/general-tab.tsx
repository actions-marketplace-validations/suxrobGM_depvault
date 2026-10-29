"use client";

import type { ReactElement } from "react";
import { Box, CardActions, CardContent, CardHeader, Grid, Stack, Typography } from "@mui/material";
import { useUpdateProfile } from "@/api/queries/account";
import { useAuth } from "@/auth/use-auth";
import { Surface } from "@/components/ui/cards";
import { LoadingSpinner } from "@/components/ui/feedback";
import { useAppForm } from "@/components/ui/form";
import { AvatarUploader } from "./avatar-uploader";
import { updateProfileSchema } from "./schemas";

export function GeneralTab(): ReactElement {
  const { user, setUser } = useAuth();

  const updateMutation = useUpdateProfile({
    onSuccess: (data) => {
      if (user) setUser({ ...user, firstName: data.firstName, lastName: data.lastName });
    },
  });

  const form = useAppForm({
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
    },
    validators: { onSubmit: updateProfileSchema },
    onSubmit: async ({ value }) => {
      await updateMutation.mutateAsync(value);
    },
  });

  if (!user) {
    return <LoadingSpinner />;
  }

  const handleAvatarChange = (avatarUrl: string) => {
    setUser({ ...user, avatarUrl });
  };

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Surface sx={{ height: "100%" }} className="vault-fade-up vault-delay-2">
          <CardHeader title="Avatar" />
          <CardContent sx={{ p: 3 }}>
            <AvatarUploader currentAvatarUrl={user.avatarUrl} onAvatarChange={handleAvatarChange} />
          </CardContent>
        </Surface>
      </Grid>
      <Grid size={{ xs: 12, md: 8 }}>
        <Surface className="vault-fade-up vault-delay-3">
          <CardHeader title="Personal Information" />
          <form.AppForm>
            <form.Form>
              <CardContent sx={{ p: 3 }}>
                <Stack spacing={2.5}>
                  <form.AppField name="firstName">
                    {(field) => <field.TextField label="First Name" />}
                  </form.AppField>
                  <form.AppField name="lastName">
                    {(field) => <field.TextField label="Last Name" />}
                  </form.AppField>
                  <Box>
                    <Typography variant="body2Muted" sx={{ mb: 1 }}>
                      Email
                    </Typography>
                    <Typography variant="body1">{user.email}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2Muted" sx={{ mb: 1 }}>
                      Role
                    </Typography>
                    <Typography variant="body1">{user.role}</Typography>
                  </Box>
                </Stack>
              </CardContent>
              <CardActions>
                <form.SubmitButton pendingLabel="Saving...">Save Changes</form.SubmitButton>
              </CardActions>
            </form.Form>
          </form.AppForm>
        </Surface>
      </Grid>
    </Grid>
  );
}
