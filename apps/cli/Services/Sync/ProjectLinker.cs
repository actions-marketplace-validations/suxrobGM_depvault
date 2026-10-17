using DepVault.Cli.ApiClient.Api.Projects;
using DepVault.Cli.Auth;
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
    IOutputFormatter output)
{
    private const string CreateNewLabel = "+ Create a new project";

    /// <summary>
    /// <c>--project</c> wins (paths stay relative to the linked root, else the repo root); then the nearest
    /// <c>.depvault.json</c>; then, interactively, the link flow. Null after printing why.
    /// </summary>
    public async Task<ProjectLink?> ResolveAsync(string? explicitProjectId, CancellationToken ct)
    {
        var link = linkStore.Find();
        if (!string.IsNullOrEmpty(explicitProjectId))
        {
            return new ProjectLink(
                link?.Root ?? repositoryLocator.FindRepoRoot(), explicitProjectId, null, link?.Ignore ?? []);
        }

        if (link is not null)
        {
            return link;
        }

        if (!prompter.IsInteractive)
        {
            output.PrintError("This folder isn't linked to a DepVault project. Run 'depvault init' or pass --project.");
            return null;
        }

        AnsiConsole.MarkupLine("[yellow]This folder isn't linked to a DepVault project yet.[/]");
        return await LinkAsync(null, ct);
    }

    /// <summary>Links the repo root to an existing or new project and writes <c>.depvault.json</c>.</summary>
    public async Task<ProjectLink?> LinkAsync(string? projectId, CancellationToken ct)
    {
        var root = repositoryLocator.FindRepoRoot();
        var client = clientFactory.Create();

        var picked = projectId is not null
            ? await FetchAsync(client, projectId, ct)
            : await PickOrCreateAsync(client, root, ct);
        if (picked is null)
        {
            return null;
        }

        linkStore.Save(root, new ProjectLinkFile { Project = picked.Value.Id, Name = picked.Value.Name });
        output.PrintSuccess($"Linked {root} to project '{picked.Value.Name}'.");
        AnsiConsole.MarkupLine(
            $"[grey]Commit {ProjectLinkStore.FileName} so other machines and CI use the same project.[/]");
        return new ProjectLink(root, picked.Value.Id, picked.Value.Name, []);
    }

    private async Task<(string Id, string Name)?> FetchAsync(ApiClient.ApiClient client, string id, CancellationToken ct)
    {
        try
        {
            var project = await client.Api.Projects[id].GetAsync(cancellationToken: ct);
            return (id, project?.Name ?? id);
        }
        catch (ApiException ex) when (ex.ResponseStatusCode is 403 or 404)
        {
            output.PrintError($"Project {id} not found or you are not a member.");
            return null;
        }
    }

    private async Task<(string Id, string Name)?> PickOrCreateAsync(
        ApiClient.ApiClient client, string root, CancellationToken ct)
    {
        var repoUrl = await repositoryLocator.GetRemoteUrlAsync(root, ct);
        var folderName = new DirectoryInfo(root).Name;
        var projects = await AnsiConsole.Status()
            .Spinner(Spinner.Known.Dots)
            .StartAsync("Fetching projects...", async _ => await ProjectQuery.ListAsync(client, ct));

        // Offer the project matching this repo's remote (or folder name) first.
        var match = ProjectMatcher.Match(projects, repoUrl, repositoryLocator.GetRepoName() ?? folderName);
        var ordered = projects
            .Where(p => p.Id is not null)
            .OrderByDescending(p => p.Id == match?.Id)
            .ToList();

        // Non-interactive init (scripts) takes the matching project, else creates one named after the folder.
        var choices = ordered.Select(p => p.Id!).Append(CreateNewLabel).ToList();
        var selected = ordered.Count == 0 || !prompter.IsInteractive
            ? match?.Id ?? CreateNewLabel
            : prompter.Select("Which project should this folder sync with?", choices, id =>
            {
                if (id == CreateNewLabel)
                {
                    return $"[cyan1]{CreateNewLabel}[/]";
                }

                var project = ordered.First(p => p.Id == id);
                var hint = project.Id == match?.Id ? " [green](matches this repo)[/]" : "";
                return Markup.Escape(project.Name ?? id) + hint;
            });

        if (selected != CreateNewLabel)
        {
            var project = ordered.First(p => p.Id == selected);
            return (project.Id!, project.Name ?? project.Id!);
        }

        var name = prompter.IsInteractive ? prompter.Ask("Project name", folderName) : folderName;
        try
        {
            var created = await client.Api.Projects.PostAsync(
                new ProjectsPostRequestBody { Name = name, RepositoryUrl = repoUrl }, cancellationToken: ct);
            return created?.Id is null ? null : (created.Id, created.Name ?? name);
        }
        catch (ApiException ex) when (ex.ResponseStatusCode == 409)
        {
            var existing = projects.FirstOrDefault(p => string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase));
            if (existing?.Id is not null && prompter.Confirm($"A project named '{Markup.Escape(name)}' already exists. Use it?"))
            {
                return (existing.Id, existing.Name ?? name);
            }

            output.PrintError($"A project named '{name}' already exists.");
            return null;
        }
    }
}
