using System.Text.Json;
using DepVault.Cli.Output;
using DepVault.Cli.Services;
using DepVault.Cli.Services.Sync;

namespace DepVault.Cli.Tests.Common;

public class JsonOutputTests
{
    [Fact]
    public void Sync_Status_Is_Camel_Case_And_Leak_Severity_Is_Its_Name()
    {
        var sync = JsonSerializer.Serialize(new SyncResultJson(false, 1, [new SyncFileJson("a", null, SyncKind.NewOnServer, null)], []),
            CliJsonContext.Default.SyncResultJson);
        var scan = JsonSerializer.Serialize(new ScanJson([], [new LeakJson("a", 1, "t", Severity.Critical, "m")], [], false),
            CliJsonContext.Default.ScanJson);

        Assert.Contains("\"status\": \"newOnServer\"", sync);
        Assert.Contains("\"severity\": \"Critical\"", scan);
    }
}
