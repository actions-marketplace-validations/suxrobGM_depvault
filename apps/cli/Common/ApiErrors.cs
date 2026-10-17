using Microsoft.Kiota.Abstractions;

namespace DepVault.Cli.Common;

/// <summary>Classifies API failures. Kiota's generated <c>*401Error</c> types don't always set the status code.</summary>
public static class ApiErrors
{
    public static bool IsAuth(Exception ex) => HasStatus(ex, 401);

    /// <summary>A plan-limit rejection: a 403 the server tags with <c>X-Error-Reason: PLAN_LIMIT</c>.</summary>
    public static bool IsPlanLimit(Exception ex) =>
        HasStatus(ex, 403)
        && ex is ApiException { ResponseHeaders: { } headers }
        && headers.Any(h => h.Key.Equals("X-Error-Reason", StringComparison.OrdinalIgnoreCase) && h.Value.Contains("PLAN_LIMIT"));

    public static bool HasStatus(Exception ex, int status) =>
        ex is ApiException apiEx
        && (apiEx.ResponseStatusCode == status || ex.GetType().Name.Contains($"{status}Error", StringComparison.Ordinal));
}
