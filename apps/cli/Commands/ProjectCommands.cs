using System.CommandLine;
using DepVault.Cli.Auth;
using DepVault.Cli.Services.ProjectResolution;
using DepVault.Cli.Services.Sync;

namespace DepVault.Cli.Commands;

/// <summary><c>project</c>: shows the folder's linked project and lists the ones you can access.</summary>
public sealed class ProjectCommands(IApiClientFactory clientFactory, AuthContext ctx, IProjectLinkStore linkStore)
{
    public Command CreateProjectCommand()
    {
        var outputOpt = new Option<string>("--output")
        { Description = "Output format (table, json)", DefaultValueFactory = _ => "table" };
        var cmd = new Command("project", "Show the linked project and list your projects (link one with 'depvault init')")
        {
            outputOpt
        };

        cmd.SetAction(async (parseResult, cancellationToken) =>
        {
            if (!ctx.RequireAuth())
            {
                return;
            }

            var items = await ProjectQuery.ListAsync(clientFactory.Create(), cancellationToken);
            var link = linkStore.Find();

            if (parseResult.GetValue(outputOpt) == "json")
            {
                ctx.Output.PrintJson(items.Select(p => new { id = p.Id, name = p.Name, linked = p.Id == link?.ProjectId }));
                return;
            }

            if (link is not null)
            {
                ctx.Output.PrintKeyValue("Linked", $"{link.DisplayName} ({link.Root})");
            }

            if (items.Count == 0)
            {
                Console.WriteLine("No projects yet. Run 'depvault init' in a repository to create one.");
                return;
            }

            ctx.Output.PrintTable(["ID", "NAME", "LINKED"], items
                .Select(p => new[] { p.Id ?? "", p.Name ?? "", p.Id == link?.ProjectId ? "*" : "" })
                .ToList());
        });

        return cmd;
    }
}
