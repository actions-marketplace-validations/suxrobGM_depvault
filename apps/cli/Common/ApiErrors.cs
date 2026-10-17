using Microsoft.Kiota.Abstractions;

namespace DepVault.Cli.Common;

/// <summary>Classifies API failures. Kiota's generated <c>*401Error</c> types don't always set the status code.</summary>
public static class ApiErrors
{
    public static bool IsAuth(Exception ex) => HasStatus(ex, 401);

    /// <summary>A plan-limit rejection (403 with "limit reached").</summary>
    public static bool IsPlanLimit(Exception ex) =>
        HasStatus(ex, 403) && ex.Message.Contains("limit reached", StringComparison.OrdinalIgnoreCase);

    public static bool HasStatus(Exception ex, int status) =>
        ex is ApiException apiEx
        && (apiEx.ResponseStatusCode == status || ex.GetType().Name.Contains($"{status}Error", StringComparison.Ordinal));
}
