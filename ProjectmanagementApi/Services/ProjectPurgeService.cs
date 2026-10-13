using Microsoft.EntityFrameworkCore;
using ProjectmanagementApi.Data;
using ProjectmanagementApi.Models;

namespace ProjectmanagementApi.Services;

/// <summary>
/// Hourly job: permanently deletes projects whose retention window has passed.
/// Tasks, members and comments are removed by the database (ON DELETE CASCADE).
/// Each purge is recorded in the audit log.
/// </summary>
public sealed class ProjectPurgeService : BackgroundService
{
    private const int BatchSize = 100;

    private readonly IServiceScopeFactory _scopes;
    private readonly IConfiguration _config;
    private readonly ILogger<ProjectPurgeService> _logger;

    public ProjectPurgeService(IServiceScopeFactory scopes, IConfiguration config, ILogger<ProjectPurgeService> logger)
    {
        _scopes = scopes;
        _config = config;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken); // let startup migrations finish first
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await PurgeExpiredAsync(stoppingToken);
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    _logger.LogWarning(ex, "Automatic project purge failed; will retry next hour.");
                }

                await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
            // shutting down
        }
    }

    private async Task PurgeExpiredAsync(CancellationToken ct)
    {
        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var cutoff = DateTime.UtcNow.AddDays(-ProjectRetention.Days(_config));
        var expired = await db.Projects.AsNoTracking()
            .Where(p => p.IsDeleted && p.DeletedAt != null && p.DeletedAt < cutoff)
            .OrderBy(p => p.DeletedAt)
            .Select(p => new { p.Id, p.Name })
            .Take(BatchSize)
            .ToListAsync(ct);
        if (expired.Count == 0) return;

        var ids = expired.Select(p => p.Id).ToList();
        var removed = await db.Projects.Where(p => ids.Contains(p.Id)).ExecuteDeleteAsync(ct);

        var now = DateTime.UtcNow;
        foreach (var p in expired)
        {
            db.AuditLogs.Add(new AuditLog
            {
                ActorUserId = null,                       // system action
                ActionType = "project.purged",
                TargetType = "project",
                TargetId = p.Id,
                Details = $"{p.Name} (automatic, retention window ended)",
                CreatedAt = now
            });
        }
        await db.SaveChangesAsync(ct);

        _logger.LogInformation("Automatic purge permanently deleted {Count} projects past their retention window.", removed);
    }
}
