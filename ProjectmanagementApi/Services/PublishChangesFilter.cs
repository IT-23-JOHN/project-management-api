using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Infrastructure;

namespace ProjectmanagementApi.Services;

/// <summary>
/// After any create/edit/delete request that SUCCEEDED, tells the live-update bus which area changed.
/// It works from the request path, so no controller needs to be edited.
/// </summary>
public sealed class PublishChangesFilter : IAsyncActionFilter
{
    private readonly RealtimeBus _bus;
    public PublishChangesFilter(RealtimeBus bus) => _bus = bus;

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var executed = await next();

        var request = context.HttpContext.Request;
        if (HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method) || HttpMethods.IsOptions(request.Method)) return;
        if (executed.Exception is not null && !executed.ExceptionHandled) return;

        // Anything that ended in an error (400, 403, 404, 409...) changed nothing, so announce nothing.
        var status = (executed.Result as IStatusCodeActionResult)?.StatusCode ?? context.HttpContext.Response.StatusCode;
        if (status >= 400) return;

        var topic = TopicFor(request.Path);
        if (topic is not null) _bus.Publish(topic);
    }

    /// <summary>/api/projects/..., /api/tasks/..., /api/users/..., /api/admin/... map to their own topic. Everything else is ignored.</summary>
    public static string? TopicFor(PathString path)
    {
        var parts = (path.Value ?? "").Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2 || !parts[0].Equals("api", StringComparison.OrdinalIgnoreCase)) return null;

        // Changing your own theme only affects you.
        if (parts[1].Equals("users", StringComparison.OrdinalIgnoreCase) && parts.Length > 2 && parts[2].Equals("me", StringComparison.OrdinalIgnoreCase))
            return null;

        return parts[1].ToLowerInvariant() switch
        {
            "projects" => "projects",
            "tasks" => "tasks",
            "users" => "users",
            "admin" => "admin",
            _ => null
        };
    }
}
