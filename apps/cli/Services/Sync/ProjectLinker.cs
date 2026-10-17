using DepVault.Cli.ApiClient.Api.Projects;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Output;
using DepVault.Cli.Services.ProjectResolution;
using Microsoft.Kiota.Abstractions;
using Spectre.Console;

namespace DepVault.Cli.Services.Sync;

/// <summary>Resolves which project a folder syncs with, linking it (writing <c>.depvault.json</c>) on first use.</summary>
public sealed class ProjectLinker(
    IApiClientFactory clientFactory,
    IProjectLinkStore linkStore,
    IRepositoryLocator repositoryLocator,
    IConsolePrompter prompter,
    Ui ui)
{
    private const string CreateNewChoice = "+ Create a new project";

    /// <summary>
    /// <c>--project</c> wins (paths stay relative to the linked root, else the repo root); then the nearest
    /// <c>.depvault.json</c>; then, interactively, the link flow.
    /// </summary>
    public async Task<ProjectLink> ResolveAsync(string? explicitProjectId, CancellationToken ct)
    {
        var link = linkStore.Find();
        if (!string.IsNullOrEmpty(explicitProjectId))
        {
            return new ProjectLink(link?.Root ?? repositoryLocator.FindRepoRoot(), explicitProjectId, null, link?.Ignore ?? []);
        }

        if (link is not null)
        {
            return link;
        }

        if (!prompter.IsInteractive)
        {
            throw new CliException("This folder isn't linked to a DepVault project. Run 'depvault init' or pass --project.");
        }

        ui.Warn("This folder isn't linked to a DepVault project yet.");
        return await LinkAsync(null, ct);
    }

    /// <summary>
    /// Links the repo root to an existing or new project. Scripts get the project matching this repo, else a new
    /// one named after the folder.
    /// </summary>
    public async Task<ProjectLink> LinkAsync(string? projectId, CancellationToken ct)
    {
        var root = repositoryLocator.FindRepoRoot();
        var (id, name) = projectId is not null ? await FetchAsync(projectId, ct) : await PickOrCreateAsync(root, ct);

        linkStore.Save(root, new ProjectLinkFile { Project = id, Name = name });
        ui.Success($"Linked {root} to project '{name}'.");
        ui.Hint($"Commit `{ProjectLinkStore.FileName}` so other machines and CI use the same project.");
        return new ProjectLink(root, id, name, []);
    }

    private async Task<(string Id, string Name)> FetchAsync(string id, CancellationToken ct)
    {
        try
        {
            var project = await clientFactory.Create().Api.Projects[id].GetAsync(cancellationToken: ct);
            return (id, project?.Name ?? id);
        }
        catch (ApiException ex) when (ApiErrors.HasStatus(ex, 403) || ApiErrors.HasStatus(ex, 404))
        {
            throw new CliException($"Project {id} not found or you are not a member.");
        }
    }

    private async Task<(string Id, string Name)> PickOrCreateAsync(string root, CancellationToken ct)
    {
        var client = clientFactory.Create();
        var repoUrl = await repositoryLocator.GetRemoteUrlAsync(root, ct);
        var folderName = new DirectoryInfo(root).Name;
        var projects = (await ui.SpinAsync("Fetching projects...", () => ProjectQuery.ListAsync(client, ct)))
            .Where(p => p.Id is not null)
            .ToList();

        // Offer the project matching this repo's remote (or folder name) first.
        var match = ProjectMatcher.Match(projects, repoUrl, repositoryLocator.GetRepoName() ?? folderName);
        var ordered = projects.OrderByDescending(p => p.Id == match?.Id).ToList();

        var selected = ordered.Count == 0 || !prompter.IsInteractive
            ? match?.Id ?? CreateNewChoice
            : prompter.Select("Which project should this folder sync with?",
                ordered.Select(p => p.Id!).Append(CreateNewChoice), id =>
                {
                    if (id == CreateNewChoice)
                    {
                        return $"[cyan1]{CreateNewChoice}[/]";
                    }

                    var project = ordered.First(p => p.Id == id);
                    var hint = project.Id == match?.Id ? " [green](matches this repo)[/]" : "";
                    return Markup.Escape(project.Name ?? id) + hint;
                });

        if (selected != CreateNewChoice)
        {
            var project = ordered.First(p => p.Id == selected);
            return (project.Id!, project.Name ?? project.Id!);
        }

        var name = prompter.IsInteractive ? prompter.Ask("Project name", folderName) : folderName;
        ProjectsPostResponse? created;
        try
        {
            created = await client.Api.Projects.PostAsync(
                new ProjectsPostRequestBody { Name = name, RepositoryUrl = repoUrl }, cancellationToken: ct);
        }
        catch (ApiException ex) when (ApiErrors.HasStatus(ex, 409))
        {
            var existing = projects.FirstOrDefault(p => string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase));
            if (existing is null || !prompter.Confirm($"A project named '{name}' already exists. Use it?", true))
            {
                throw new CliException($"A project named '{name}' already exists.");
            }

            return (existing.Id!, existing.Name ?? name);
        }

        if (created?.Id is null)
        {
            throw new CliException("DepVault didn't return the new project.");
        }

        return (created.Id, created.Name ?? name);
    }
}
