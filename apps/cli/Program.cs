using DepVault.Cli;
using DepVault.Cli.Common;
using DepVault.Cli.Output;
using DepVault.Cli.Repl;
using DepVault.Cli.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Kiota.Abstractions;
using Spectre.Console;

Startup.CleanupStaleUpdate();

var services = Startup.CreateServices();
var rootCommand = Startup.CreateRootCommand(services);

if (args.Length == 0
    && !Console.IsInputRedirected
    && !Console.IsOutputRedirected
    && string.IsNullOrEmpty(Environment.GetEnvironmentVariable("DEPVAULT_TOKEN")))
{
    var repl = services.GetRequiredService<ReplHost>();
    return await repl.RunAsync(rootCommand);
}

var parseResult = rootCommand.Parse(args);
parseResult.InvocationConfiguration.EnableDefaultExceptionHandler = false;

int exitCode;
try
{
    // Handlers report failure through Environment.ExitCode (they return no value).
    exitCode = await parseResult.InvokeAsync();
    if (exitCode == 0)
    {
        exitCode = Environment.ExitCode;
    }
}
catch (PromptCanceledException)
{
    AnsiConsole.MarkupLine("[yellow]Cancelled.[/]");
    return 130;
}
catch (CiTokenFormatException ex)
{
    services.GetRequiredService<IOutputFormatter>().PrintError(ex.Message);
    return 1;
}
catch (Exception ex) when (ApiErrorHandler.IsAuthError(ex))
{
    ApiErrorHandler.PrintAuthError();
    return 1;
}
catch (ApiException ex)
{
    services.GetRequiredService<IErrorHandler>().Handle(ex, "API request failed");
    return 1;
}

var firstArg = args.Length > 0 ? args[0] : null;
if (firstArg is not "update" and not "version")
{
    await services.GetRequiredService<IVersionChecker>().PrintUpdateHintAsync();
}

return exitCode;
