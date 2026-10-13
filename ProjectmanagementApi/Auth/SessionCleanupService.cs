using Microsoft.EntityFrameworkCore;
using ProjectmanagementApi.Data;

namespace ProjectmanagementApi.Services;

/// <summary>Hourly housekeeping: removes sessions and OTP codes that expired more than a day ago.</summary>
public sealed class SessionCleanupService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<SessionCleanupService> _logger;

    public SessionCleanupService(IServiceScopeFactory scopes, ILogger<SessionCleanupService> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken); // let startup migrations finish first
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _scopes.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                    var cutoff = DateTime.UtcNow.AddDays(-1);

                    var sessions = await db.UserSessions
                        .Where(s => s.AbsoluteExpiresAt < cutoff || s.ExpiresAt < cutoff || (s.RevokedAt != null && s.RevokedAt < cutoff))
                        .ExecuteDeleteAsync(stoppingToken);
                    var codes = await db.OtpCodes
                        .Where(o => o.CreatedAt < cutoff)
                        .ExecuteDeleteAsync(stoppingToken);

                    if (sessions + codes > 0)
                        _logger.LogInformation("Cleanup removed {Sessions} expired sessions and {Codes} old sign-in codes.", sessions, codes);
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    _logger.LogWarning(ex, "Session cleanup failed; will retry next hour.");
                }

                await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
            // shutting down
        }
    }
}
