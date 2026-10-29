"use client";

import { type ReactElement, useState } from "react";
import { Box, Tab, Tabs, Typography } from "@mui/material";
import { CopyButton } from "@/components/ui/inputs";

const GITHUB_ACTIONS_SNIPPET = `# Store the token as the DEPVAULT_TOKEN repository secret
- name: Setup DepVault CLI
  uses: suxrobGM/depvault@v1

# Writes every file the token can read to its path in the repository
- name: Pull files
  env:
    DEPVAULT_TOKEN: \${{ secrets.DEPVAULT_TOKEN }}
  run: depvault pull`;

const GITLAB_CI_SNIPPET = `# Store the token as a masked DEPVAULT_TOKEN CI/CD variable
pull-files:
  before_script:
    - curl -fsSL https://get.depvault.com | bash
  script:
    # Writes every file the token can read to its path in the repository
    - depvault pull`;

/** CI examples. `depvault pull` uses DEPVAULT_TOKEN when set; pass paths or globs to narrow it. */
export function CiTokenUsageSnippets(): ReactElement {
  const [tab, setTab] = useState(0);
  const snippet = tab === 0 ? GITHUB_ACTIONS_SNIPPET : GITLAB_CI_SNIPPET;

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ minHeight: 32 }}>
        <Tab label="GitHub Actions" sx={{ minHeight: 32, py: 0.5, textTransform: "none" }} />
        <Tab label="GitLab CI" sx={{ minHeight: 32, py: 0.5, textTransform: "none" }} />
      </Tabs>
      <Box sx={{ position: "relative", mt: 1 }}>
        <Box sx={{ position: "absolute", top: 4, right: 4, zIndex: 1 }}>
          <CopyButton value={snippet} />
        </Box>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 1.5,
            pr: 5,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            bgcolor: "action.hover",
            fontFamily: "monospace",
            fontSize: "0.75rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            maxHeight: 240,
            overflow: "auto",
          }}
        >
          {snippet}
        </Box>
      </Box>
      <Typography variant="captionMuted" sx={{ display: "block", mt: 1 }}>
        Append paths or globs (e.g. <code>depvault pull deploy/**</code>) to pull only some of the
        token&apos;s files.
      </Typography>
    </Box>
  );
}
