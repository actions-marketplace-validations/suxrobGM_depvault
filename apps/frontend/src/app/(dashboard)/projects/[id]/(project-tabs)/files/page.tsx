import type { ReactElement } from "react";
import { FilesTab } from "@/components/features/projects/files/files-tab";

interface PageParams {
  id: string;
}

interface PageProps {
  params: Promise<PageParams>;
}

export default async function ProjectFilesPage(props: PageProps): Promise<ReactElement> {
  const { id } = await props.params;
  return <FilesTab projectId={id} />;
}
