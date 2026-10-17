using System.CommandLine;
using DepVault.Cli.Auth;
using DepVault.Cli.Commands;
using DepVault.Cli.Config;
using DepVault.Cli.Crypto;
using DepVault.Cli.Output;
using DepVault.Cli.Repl;
using DepVault.Cli.Services;
using DepVault.Cli.Services.Scan;
using DepVault.Cli.Services.Sync;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Kiota.Abstractions.Authentication;

namespace DepVault.Cli;

internal static class Startup
{
    public static ServiceProvider CreateServices()
    {
        return new ServiceCollection()
            // Core
            .AddSingleton<IConfigService, ConfigService>()
            // Credentials use a dedicated protector key file so vault lock/logout
            // resetting the vault protector cannot invalidate stored tokens
            .AddSingleton<ICredentialStore>(_ =>
                new CredentialStore(CreateKekProtector("credentials-protector.key")))
            .AddSingleton<IAuthenticationProvider, TokenAuthProvider>()
            .AddSingleton<IApiClientFactory, ApiClientFactory>()
            .AddSingleton<IOutputFormatter, OutputFormatter>()
            .AddSingleton<IErrorHandler, ErrorHandler>()
            .AddSingleton<IConsolePrompter, ConsolePrompter>()
            .AddSingleton<IFileScanner, FileScanner>()
            .AddSingleton<IRepositoryLocator, RepositoryLocator>()
            .AddSingleton<IFileArgResolver, FileArgResolver>()
            .AddSingleton<ISecretDetector, SecretDetector>()
            .AddSingleton<IGitHubReleaseClient, GitHubReleaseClient>()
            .AddSingleton<IVersionChecker, VersionChecker>()
            .AddSingleton<IUpdateService, UpdateService>()
            .AddSingleton<ConsoleRenderer>()
            .AddSingleton<AuthContext>()
            .AddSingleton<VaultState>()
            .AddSingleton<IKekProtector>(_ => CreateKekProtector("vault-protector.key"))
            .AddSingleton<IPersistentVaultStore, PersistentVaultStore>()
            .AddSingleton<RememberedUnlockService>()
            .AddSingleton<VaultUnlockService>()
            .AddSingleton<InteractiveVaultUnlocker>()
            .AddSingleton<DekService>()
            .AddSingleton<AnalysisClient>()
            // File sync
            .AddSingleton<IProjectLinkStore, ProjectLinkStore>()
            .AddSingleton<ISyncStateStore, SyncStateStore>()
            .AddSingleton<ILocalFileScanner, LocalFileScanner>()
            .AddSingleton<ProjectLinker>()
            .AddSingleton<SyncService>()
            .AddSingleton<CiPuller>()
            .AddSingleton<SyncSession>()
            // Scan steps
            .AddSingleton<DependencyScanner>()
            .AddSingleton<SecretLeakScanner>()
            .AddSingleton<UntrackedFileReporter>()
            // Commands
            .AddSingleton<AuthCommands>()
            .AddSingleton<ConfigCommands>()
            .AddSingleton<DoctorCommands>()
            .AddSingleton<ProjectCommands>()
            .AddSingleton<AnalysisCommands>()
            .AddSingleton<SyncCommands>()
            .AddSingleton<PurgeCommands>()
            .AddSingleton<ScanCommands>()
            .AddSingleton<UpdateCommands>()
            .AddSingleton<VaultCommands>()
            .AddSingleton<RootHandler>()
            // REPL
            .AddSingleton<ReplHost>()
            .BuildServiceProvider();
    }

    private static IKekProtector CreateKekProtector(string keyFileName)
    {
        return OperatingSystem.IsWindows()
            ? new WindowsKekProtector()
            : new PosixKekProtector(Path.Combine(Constants.ConfigDir, keyFileName));
    }

    public static RootCommand CreateRootCommand(ServiceProvider services)
    {
        var auth = services.GetRequiredService<AuthCommands>();
        var config = services.GetRequiredService<ConfigCommands>();
        var project = services.GetRequiredService<ProjectCommands>();
        var analysis = services.GetRequiredService<AnalysisCommands>();
        var sync = services.GetRequiredService<SyncCommands>();
        var purge = services.GetRequiredService<PurgeCommands>();
        var scan = services.GetRequiredService<ScanCommands>();
        var update = services.GetRequiredService<UpdateCommands>();
        var vault = services.GetRequiredService<VaultCommands>();
        var doctor = services.GetRequiredService<DoctorCommands>();

        var rootCommand = new RootCommand("DepVault CLI — end-to-end encrypted env and secret files, plus dependency analysis")
        {
            auth.CreateLoginCommand(),
            auth.CreateLogoutCommand(),
            auth.CreateWhoamiCommand(),
            sync.CreateInitCommand(),
            sync.CreateStatusCommand(),
            sync.CreatePushCommand(),
            sync.CreatePullCommand(),
            sync.CreateUntrackCommand(),
            purge.CreatePurgeCommand(),
            project.CreateProjectCommand(),
            config.CreateConfigCommand(),
            analysis.CreateAnalyzeCommand(),
            scan.CreateScanCommand(),
            update.CreateUpdateCommand(),
            vault.CreateUnlockCommand(),
            vault.CreateLockCommand(),
            doctor.CreateDoctorCommand()
        };

        services.GetRequiredService<RootHandler>().Configure(rootCommand);

        var renderer = services.GetRequiredService<ConsoleRenderer>();
        var versionCmd = new Command("version", "Show CLI version");
        versionCmd.SetAction(_ => renderer.PrintBanner());
        rootCommand.Add(versionCmd);

        var clearCmd = new Command("clear", "Clear the screen");
        clearCmd.SetAction(_ => renderer.Clear());
        rootCommand.Add(clearCmd);

        return rootCommand;
    }

    public static void CleanupStaleUpdate()
    {
        try
        {
            var oldBinary = Environment.ProcessPath + ".old";
            if (File.Exists(oldBinary))
            {
                File.Delete(oldBinary);
            }
        }
        catch { /* best-effort */ }
    }
}
