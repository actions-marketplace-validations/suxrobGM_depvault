"use client";

import type { ReactElement, ReactNode } from "react";
import type { Route } from "next";
import { useProject } from "@/api/queries/projects";
import { PageHeader } from "@/components/ui/containers";
import { ROUTES } from "@/lib/constants";

interface BreadcrumbLink {
  label: string;
  href: Route;
}

interface ProjectSubpageHeaderProps {
  projectId: string;
  title: string;
  subtitle?: string;
  /** Crumbs between the project and the page title, e.g. the analyses list on a detail page. */
  trail?: BreadcrumbLink[];
  actions?: ReactNode;
}

/** Page header for project pages outside the tab layout: Overview › Projects › project › page. */
export function ProjectSubpageHeader(props: ProjectSubpageHeaderProps): ReactElement {
  const { projectId, title, subtitle, trail = [], actions } = props;
  const { data: project } = useProject(projectId);

  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      breadcrumbs={[
        { label: "Overview", href: ROUTES.overview },
        { label: "Projects", href: ROUTES.projects },
        { label: project?.name ?? "Project", href: ROUTES.project(projectId) },
        ...trail,
        { label: title },
      ]}
      actions={actions}
    />
  );
}
