using System.Text.Json;
using System.Text.Json.Serialization;
using DepVault.Cli.Services;
using DepVault.Cli.Services.Sync;

namespace DepVault.Cli.Output;

// Shapes printed by --json. Source-generated because Native AOT can't serialize by reflection.

public sealed record SyncFileJson(
    string Path, string? From, [property: JsonConverter(typeof(CamelCaseEnumConverter<SyncKind>))] SyncKind Status, string? Reason);

public sealed record StatusJson(string Project, string Root, List<SyncFileJson> Files);

public sealed record SyncResultJson(bool DryRun, int Applied, List<SyncFileJson> Files, List<string> Errors);

public sealed record ProjectJson(string Id, string Name, bool Linked);

public sealed record DependencyJson(
    string Name, string Version, string? LatestVersion, string? Status, string? License, int Vulnerabilities);

public sealed record AnalysisJson(string File, double HealthScore, List<DependencyJson> Dependencies);

public sealed record LeakJson(
    string File, int Line, string Type, [property: JsonConverter(typeof(JsonStringEnumConverter<Severity>))] Severity Severity, string Match);

public sealed record ScanJson(
    List<AnalysisJson> Analyses, List<LeakJson> Leaks, List<string> UnsyncedFiles, bool Failed);

public sealed record VersionJson(int Version, string Path, string? Message, string Author, DateTimeOffset? Date, long Size);

[JsonSerializable(typeof(StatusJson))]
[JsonSerializable(typeof(SyncResultJson))]
[JsonSerializable(typeof(List<ProjectJson>))]
[JsonSerializable(typeof(List<AnalysisJson>))]
[JsonSerializable(typeof(ScanJson))]
[JsonSerializable(typeof(List<VersionJson>))]
[JsonSourceGenerationOptions(
    WriteIndented = true,
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
internal partial class CliJsonContext : JsonSerializerContext;

internal sealed class CamelCaseEnumConverter<T>() : JsonStringEnumConverter<T>(JsonNamingPolicy.CamelCase) where T : struct, Enum;
