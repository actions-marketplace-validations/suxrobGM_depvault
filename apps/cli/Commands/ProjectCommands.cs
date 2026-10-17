using System.CommandLine;
using DepVault.Cli.Auth;
using DepVault.Cli.Common;
using DepVault.Cli.Output;
using DepVault.Cli.Services.ProjectResolution;
using DepVault.Cli.Services.Sync;

namespace DepVault.Cli.Commands;

/// <summary><c>project</c>: shows the folder's linked project and lists the ones you can access.</summary>
public sealed class ProjectCommands(IApiClientFactory clientFactory, Session session, IProjectLinkStore linkStore, Ui ui)
{
    public Command CreateProjectCommand()
    {
        var cmd = new Command("project", "Show the linked project and list your projects")
        {
            CliOptions.Json
        };

        cmd.SetAction(async (_, ct) =>
        {
            session.RequireUser();
            var projects = await ui.SpinAsync("Fetching projects...", () => ProjectQuery.ListAsync(clientFactory.Create(), ct));
            var link = linkStore.Find();

            if (ui.Json)
            {
                ui.WriteJson(projects.Select(p => new ProjectJson(p.Id ?? "", p.Name ?? "", p.Id == link?.ProjectId)).ToList(),
                    CliJsonContext.Default.ListProjectJson);
                return ExitCodes.Ok;
            }

            if (link is not null)
            {
                ui.KeyValue("Linked", $"{link.DisplayName} ({link.Root})");
            }

            if (projects.Count == 0)
            {
                ui.Hint("No projects yet. Run `depvault init` in a repository to create one.");
                return ExitCodes.Ok;
            }

            ui.Table(["ID", "NAME", "LINKED"],
                projects.Select(p => new[] { p.Id ?? "", p.Name ?? "", p.Id == link?.ProjectId ? "*" : "" }));
            return ExitCodes.Ok;
        });

        return cmd;
    }
}
