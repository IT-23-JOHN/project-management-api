using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using ProjectmanagementApi.Services;

// Same namespace as the controllers, so [RequireSession] / [RequireAdmin] resolve without extra using lines.
namespace ProjectmanagementApi.Controllers;

/// <summary>Helpers to read the signed-in user that the filters below resolved for this request.</summary>
public static class HttpContextSessionExtensions
{
    private const string Key = "pm.session";

    /// <summary>The signed-in user. Non-null inside any action protected by [RequireSession] / [RequireAdmin].</summary>
    public static SessionUser? GetSessionUser(this HttpContext context) =>
        context.Items.TryGetValue(Key, out var value) ? value as SessionUser : null;

    internal static async Task<SessionUser?> ResolveSessionAsync(this HttpContext context)
    {
        if (context.Items.TryGetValue(Key, out var cached) && cached is SessionUser existing) return existing;

        var sessions = context.RequestServices.GetRequiredService<SessionService>();
        var me = await sessions.ValidateAsync(AuthController.Bearer(context.Request), context.RequestAborted);
        if (me is not null) context.Items[Key] = me;
        return me;
    }
}

/// <summary>401 unless the request carries a valid, unexpired session token.</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
public sealed class RequireSessionAttribute : Attribute, IAsyncAuthorizationFilter
{
    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var me = await context.HttpContext.ResolveSessionAsync();
        if (me is null)
            context.Result = new UnauthorizedObjectResult(new { error = "unauthorized", message = "Authentication required." });
    }
}

/// <summary>401 when not signed in (or the session expired), 403 when signed in but not an admin.</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
public sealed class RequireAdminAttribute : Attribute, IAsyncAuthorizationFilter
{
    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var me = await context.HttpContext.ResolveSessionAsync();
        if (me is null)
        {
            context.Result = new UnauthorizedObjectResult(new { error = "unauthorized", message = "Authentication required." });
            return;
        }

        if (me.Role != "Admin")
            context.Result = new ObjectResult(new { error = "forbidden", message = "Admin role required." }) { StatusCode = StatusCodes.Status403Forbidden };
    }
}
