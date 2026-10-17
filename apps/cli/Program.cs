using DepVault.Cli;
using DepVault.Cli.Commands;
using DepVault.Cli.Common;
using DepVault.Cli.Config;
using DepVault.Cli.Output;
using DepVault.Cli.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Kiota.Abstractions;
using Spectre.Console;

// Box drawing and arrows need UTF-8; Windows consoles default to a legacy code page.
Console.OutputEncoding = System.Text.Encoding.UTF8;
Startup.CleanupStaleUpdate();

using var services = Startup.CreateServices();
var rootCommand = Startup.CreateRootCommand(services);
var ui = services.GetRequiredService<Ui>();
var env = services.GetRequiredService<CliEnvironment>();

var parseResult = rootCommand.Parse(args);
ui.Json = parseResult.GetValue(CliOptions.Json);

if (parseResult.Errors.Count > 0)
{
    parseResult.Errors.ToList().ForEach(e => ui.Error(e.Message));
    var failed = parseResult.CommandResult.Command;
    ui.Warn($"Run '{(failed == rootCommand ? "depvault" : $"depvault {failed.Name}")} --help' for usage.");
    return ExitCodes.Usage;
}

// Handlers throw instead of printing their own failures; this is the one place they are rendered.
parseResult.InvocationConfiguration.EnableDefaultExceptionHandler = false;
int exitCode;
try
{
    exitCode = await parseResult.InvokeAsync();
}
catch (CliException ex)
{
    ui.Error(ex.Message);
    exitCode = ex.ExitCode;
}
catch (Exception ex) when (ex is PromptCanceledException or OperationCanceledException)
{
    ui.Warn("Cancelled.");
    exitCode = ExitCodes.Cancelled;
}
catch (Exception ex) when (ApiErrors.IsAuth(ex))
{
    ui.ErrorPanel("Authentication Error",
        env.IsCi ? "DEPVAULT_TOKEN is invalid, expired or revoked." : "Your session has expired or your token is invalid.",
        env.IsCi ? "Create a new CI token in the project's settings and update the pipeline secret." : "Run `depvault login` to sign in again.",
        Color.Red);
    exitCode = ExitCodes.Error;
}
catch (Exception ex) when (ApiErrors.IsPlanLimit(ex))
{
    ui.ErrorPanel("Plan Limit Reached", ex.Message, "Upgrade your plan at `depvault.com/settings/billing`.", Color.Yellow);
    exitCode = ExitCodes.Error;
}
catch (ApiException ex)
{
    ui.Error($"DepVault request failed: {ex.Message}");
    exitCode = ExitCodes.Error;
}
catch (HttpRequestException ex)
{
    ui.Error($"Can't reach {services.GetRequiredService<IConfigService>().Load().Server}: {ex.Message}");
    exitCode = ExitCodes.Error;
}
catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
{
    ui.Error(ex.Message);
    exitCode = ExitCodes.Error;
}

var command = parseResult.CommandResult.Command.Name;
if (!env.IsCi && !ui.Json && !Console.IsErrorRedirected && command is not ("update" or "version"))
{
    await services.GetRequiredService<IVersionChecker>().PrintUpdateHintAsync();
}

return exitCode;
