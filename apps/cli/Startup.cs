using System.CommandLine;
using DepVault.Cli.Auth;
using DepVault.Cli.Commands;
using DepVault.Cli.Config;
using DepVault.Cli.Crypto;
using DepVault.Cli.Output;
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
            .AddSingleton<CliEnvironment>()
            .AddSingleton<Ui>()
            .AddSingleton<IConsolePrompter, ConsolePrompter>()
            .AddSingleton<IConfigService, ConfigService>()
            // A separate protector key from the vault's, so `lock` can't invalidate stored tokens.
            .AddSingleton<ICredentialStore>(_ => new CredentialStore(CreateKekProtector("credentials-protector.key")))
            .AddSingleton<Session>()
            .AddSingleton<IAuthenticationProvider, TokenAuthProvider>()
            .AddSingleton<IApiClientFactory, ApiClientFactory>()
            .AddSingleton<IPersistentVaultStore>(_ => new PersistentVaultStore(CreateKekProtector("vault-protector.key")))
            .AddSingleton<VaultUnlocker>()
            .AddSingleton<DekService>()
            .AddSingleton<IRepositoryLocator, RepositoryLocator>()
            .AddSingleton<IGitCheckIgnore, GitCheckIgnore>()
            .AddSingleton<IFileScanner, FileScanner>()
            .AddSingleton<ISecretDetector, SecretDetector>()
            .AddSingleton<AnalysisClient>()
            .AddSingleton<RepoScanner>()
            .AddSingleton<IRepoFilesApi, RepoFilesApi>()
            .AddSingleton<IProjectLinkStore, ProjectLinkStore>()
            .AddSingleton<ISyncStateStore, SyncStateStore>()
            .AddSingleton<ILocalFileScanner, LocalFileScanner>()
            .AddSingleton<ProjectLinker>()
            .AddSingleton<SyncService>()
            .AddSingleton<CiPuller>()
            .AddSingleton<SyncView>()
            .AddSingleton<SyncSession>()
            .AddSingleton<IGitHubReleaseClient, GitHubReleaseClient>()
            .AddSingleton<IVersionChecker, VersionChecker>()
            .AddSingleton<IUpdateService, UpdateService>()
            .AddSingleton<AuthCommands>()
            .AddSingleton<SyncCommands>()
            .AddSingleton<HistoryCommands>()
            .AddSingleton<PurgeCommands>()
            .AddSingleton<VaultCommands>()
            .AddSingleton<ProjectCommands>()
            .AddSingleton<AnalysisCommands>()
            .AddSingleton<ScanCommands>()
            .AddSingleton<ConfigCommands>()
            .AddSingleton<DoctorCommands>()
            .AddSingleton<UpdateCommands>()
            .AddSingleton<RootHandler>()
            .BuildServiceProvider();
    }

    public static RootCommand CreateRootCommand(IServiceProvider services)
    {
        var auth = services.GetRequiredService<AuthCommands>();
        var sync = services.GetRequiredService<SyncCommands>();
        var history = services.GetRequiredService<HistoryCommands>();
        var vault = services.GetRequiredService<VaultCommands>();
        var update = services.GetRequiredService<UpdateCommands>();

        var rootCommand = new RootCommand("DepVault CLI: end-to-end encrypted secret files, plus dependency analysis")
        {
            sync.CreateInitCommand(),
            sync.CreateStatusCommand(),
            sync.CreatePushCommand(),
            sync.CreatePullCommand(),
            sync.CreateUntrackCommand(),
            history.CreateLogCommand(),
            history.CreateDiffCommand(),
            history.CreateRestoreCommand(),
            services.GetRequiredService<PurgeCommands>().CreatePurgeCommand(),
            auth.CreateLoginCommand(),
            auth.CreateLogoutCommand(),
            auth.CreateWhoamiCommand(),
            vault.CreateUnlockCommand(),
            vault.CreateLockCommand(),
            services.GetRequiredService<ProjectCommands>().CreateProjectCommand(),
            services.GetRequiredService<AnalysisCommands>().CreateAnalyzeCommand(),
            services.GetRequiredService<ScanCommands>().CreateScanCommand(),
            services.GetRequiredService<ConfigCommands>().CreateConfigCommand(),
            services.GetRequiredService<DoctorCommands>().CreateDoctorCommand(),
            update.CreateUpdateCommand(),
            update.CreateVersionCommand()
        };

        services.GetRequiredService<RootHandler>().Configure(rootCommand);
        return rootCommand;
    }

    /// <summary>Removes the binary a Windows self-update had to leave behind while it was running.</summary>
    public static void CleanupStaleUpdate()
    {
        try
        {
            File.Delete(Environment.ProcessPath + ".old");
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Still locked; the next run retries.
        }
    }

    private static IKekProtector CreateKekProtector(string keyFileName)
    {
        return OperatingSystem.IsWindows()
            ? new WindowsKekProtector()
            : new PosixKekProtector(Path.Combine(Constants.ConfigDir, keyFileName));
    }
}
