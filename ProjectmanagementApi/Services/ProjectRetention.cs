using Microsoft.Extensions.Configuration;

namespace ProjectmanagementApi.Services;

/// <summary>
/// How long a soft-deleted project can be restored before it is purged for good.
/// Set it in appsettings.json:  "Projects": { "RetentionDays": 30 }   (default 30, allowed 1 to 3650)
/// </summary>
public static class ProjectRetention
{
    public const int DefaultDays = 30;

    public static int Days(IConfiguration config) =>
        Math.Clamp(config.GetValue<int>("Projects:RetentionDays", DefaultDays), 1, 3650);
}
