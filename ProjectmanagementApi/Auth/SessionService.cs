using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using ProjectmanagementApi.Controllers;
using ProjectmanagementApi.Data;
using ProjectmanagementApi.Models;

namespace ProjectmanagementApi.Services;

/// <summary>
/// Database-backed sign-in sessions.
/// - The browser only ever holds a random token; the database stores its SHA-256 hash.
/// - Idle timeout is sliding: every use pushes the expiry forward (default 120 min).
/// - Absolute lifetime is a hard cap that sliding cannot extend (default 12 h).
/// - Sessions survive API restarts and can be revoked (logout).
/// Optional settings in appsettings.json:  "Auth": { "IdleMinutes": 120, "AbsoluteHours": 12 }
/// </summary>
public sealed class SessionService
{
    private static readonly TimeSpan TouchInterval = TimeSpan.FromMinutes(1); // avoid a DB write on every request

    private readonly AppDbContext _db;
    private readonly TimeSpan _idle;
    private readonly TimeSpan _absolute;

    public SessionService(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _idle = TimeSpan.FromMinutes(config.GetValue<int>("Auth:IdleMinutes", 120));
        _absolute = TimeSpan.FromHours(config.GetValue<int>("Auth:AbsoluteHours", 12));
    }

    public async Task<(string Token, DateTime ExpiresAt)> CreateAsync(Guid userId, string? userAgent)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var now = DateTime.UtcNow;
        var absolute = now + _absolute;
        var row = new UserSession
        {
            UserId = userId,
            TokenHash = Hash(token),
            CreatedAt = now,
            LastSeenAt = now,
            ExpiresAt = Min(now + _idle, absolute),
            AbsoluteExpiresAt = absolute,
            UserAgent = string.IsNullOrWhiteSpace(userAgent) ? null : (userAgent.Length > 200 ? userAgent[..200] : userAgent)
        };
        _db.UserSessions.Add(row);
        await _db.SaveChangesAsync();
        return (token, row.ExpiresAt);
    }

    /// <summary>Returns the signed-in user for a token, or null if it is unknown, expired, revoked, or the user is inactive.</summary>
    public async Task<SessionUser?> ValidateAsync(string? token, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;

        var hash = Hash(token);
        var now = DateTime.UtcNow;

        var row = await (
            from s in _db.UserSessions.AsNoTracking()
            join u in _db.Users.AsNoTracking() on s.UserId equals u.Id
            where s.TokenHash == hash
            select new
            {
                SessionId = s.Id,
                s.RevokedAt,
                s.ExpiresAt,
                s.AbsoluteExpiresAt,
                s.LastSeenAt,
                s.CurrentProjectId,
                s.ProjectRole,
                UserId = u.Id,
                u.FullName,
                u.Email,
                u.Role,
                u.AuthCodeLast4,
                u.IsActive
            }).FirstOrDefaultAsync(ct);

        if (row is null || row.RevokedAt is not null || !row.IsActive) return null;
        if (now >= row.ExpiresAt || now >= row.AbsoluteExpiresAt) return null;

        if (now - row.LastSeenAt >= TouchInterval)
        {
            var newExpiry = Min(now + _idle, row.AbsoluteExpiresAt);
            await _db.UserSessions
                .Where(s => s.Id == row.SessionId)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(x => x.LastSeenAt, now)
                    .SetProperty(x => x.ExpiresAt, newExpiry), ct);
        }

        return new SessionUser(row.UserId, row.FullName, row.Email, AuthController.NormalizeRole(row.Role),
            row.AuthCodeLast4, row.CurrentProjectId, row.ProjectRole);
    }

    public async Task RevokeAsync(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return;
        var hash = Hash(token);
        var now = DateTime.UtcNow;
        await _db.UserSessions
            .Where(s => s.TokenHash == hash && s.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, (DateTime?)now));
    }

    public async Task SetProjectContextAsync(string? token, Guid? projectId, string? projectRole)
    {
        if (string.IsNullOrWhiteSpace(token)) return;
        var hash = Hash(token);
        await _db.UserSessions
            .Where(s => s.TokenHash == hash && s.RevokedAt == null)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.CurrentProjectId, projectId)
                .SetProperty(x => x.ProjectRole, projectRole));
    }

    private static DateTime Min(DateTime a, DateTime b) => a < b ? a : b;

    private static string Hash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}
