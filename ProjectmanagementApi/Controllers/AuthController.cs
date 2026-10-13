using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using ProjectmanagementApi.Data;
using ProjectmanagementApi.Models;
using ProjectmanagementApi.Services;

namespace ProjectmanagementApi.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private const int OtpLifetimeMinutes = 10;
    private const int MaxOtpAttempts = 5;
    private const int MaxOtpRequestsPerHour = 3;

    private readonly AppDbContext _db;
    private readonly IHostEnvironment _env;
    private readonly IEmailSender _email;
    private readonly ILogger<AuthController> _logger;
    private readonly SessionService _sessions;

    public AuthController(AppDbContext db, IHostEnvironment env, IEmailSender email, ILogger<AuthController> logger, SessionService sessions)
    {
        _db = db;
        _env = env;
        _email = email;
        _logger = logger;
        _sessions = sessions;
    }

    [HttpPost("request-otp")]
    [EnableRateLimiting(AuthRateLimiting.OtpRequest)]
    public async Task<IActionResult> RequestOtp(RequestOtpBody body)
    {
        var destination = (body.Destination ?? "").Trim();
        if (string.IsNullOrWhiteSpace(destination))
            return BadRequest(new { error = "invalid_destination", message = "Email or phone is required." });

        var isEmailDestination = destination.Contains('@');
        if (isEmailDestination && !MailAddress.TryCreate(destination, out _))
            return BadRequest(new { error = "invalid_destination", message = "Enter a valid email address." });

        // The code is only ever delivered by email. The single exception is local development
        // with no SMTP configured, where it is returned in the response so you can still sign in.
        var canEmail = isEmailDestination && _email.IsConfigured;
        var devFallback = _env.IsDevelopment() && !canEmail;
        if (!canEmail && !devFallback)
        {
            return isEmailDestination
                ? StatusCode(503, new { error = "email_not_configured", message = "Email delivery is not set up on the server yet. Please contact the administrator." })
                : BadRequest(new { error = "phone_not_supported", message = "Phone sign-in is not available yet. Please use your email address." });
        }

        var key = destination.ToLowerInvariant();
        var now = DateTime.UtcNow;

        // Rate limit: at most 3 codes per hour per destination (counted from the OtpCodes table, so it survives restarts).
        var windowStart = now.AddHours(-1);
        var recent = await _db.OtpCodes
            .Where(o => o.Destination == key && o.CreatedAt > windowStart)
            .OrderBy(o => o.CreatedAt)
            .Select(o => o.CreatedAt)
            .ToListAsync();
        if (recent.Count >= MaxOtpRequestsPerHour)
        {
            var retryAfter = Math.Max(1, (int)(3600 - (now - recent[0]).TotalSeconds));
            return StatusCode(429, new
            {
                error = "rate_limited",
                message = "Too many OTP requests. Limited to 3 requests per hour per destination.",
                retryAfterSeconds = retryAfter
            });
        }

        // Only the newest code may be used: retire any earlier unused ones.
        await _db.OtpCodes
            .Where(o => o.Destination == key && o.UsedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.UsedAt, (DateTime?)now));

        var code = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
        var otp = new OtpCode
        {
            Destination = key,
            CodeHash = OtpHash(key, code),
            Purpose = "login",
            CreatedAt = now,
            ExpiresAt = now.AddMinutes(OtpLifetimeMinutes)
        };
        _db.OtpCodes.Add(otp);
        await _db.SaveChangesAsync();

        string? sendFailure = null; // set only in Development when SMTP fails

        if (canEmail)
        {
            try
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
                await _email.SendOtpAsync(destination, code, OtpLifetimeMinutes, timeout.Token);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send sign-in code email to {Destination}", destination);

                if (_env.IsDevelopment())
                {
                    // DEVELOPMENT ONLY: keep the code valid and print it in this API console window,
                    // so you can still sign in while SMTP is being fixed. Never returned to the browser.
                    _logger.LogWarning("DEV ONLY - email could not be sent. Sign-in code for {Destination} is {Code}", destination, code);
                    sendFailure = ex.GetBaseException().Message;
                }
                else
                {
                    // Production: don't leave a usable code behind, and don't count a failed send against the user's limit.
                    _db.OtpCodes.Remove(otp);
                    await _db.SaveChangesAsync();
                    return StatusCode(502, new { error = "email_failed", message = "We couldn't send the email right now. Please try again in a moment." });
                }
            }
        }
        else
        {
            _logger.LogWarning("Email is not configured; returning the sign-in code in the response (development only).");
        }

        _db.AuditLogs.Add(new AuditLog
        {
            ActionType = "auth.otp_requested",
            TargetType = "destination",
            TargetId = Guid.Empty,
            Details = $"OTP requested for {destination} from {AuthRateLimiting.ClientIp(HttpContext)}",
            CreatedAt = now
        });
        await _db.SaveChangesAsync();

        return Ok(new
        {
            success = true,
            message = sendFailure is not null
                ? "The email could not be sent. Development mode: the code was printed in the API console window."
                : canEmail ? "Verification code sent to your email." : "Development mode: email is not configured.",
            delivery = sendFailure is not null ? "console" : canEmail ? "email" : "dev",
            detail = sendFailure,
            expiresInSeconds = OtpLifetimeMinutes * 60,
            resendAvailableInSeconds = 60,
            devOtp = devFallback ? code : null
        });
    }

    [HttpPost("verify-otp")]
    [EnableRateLimiting(AuthRateLimiting.OtpVerify)]
    public async Task<IActionResult> VerifyOtp(VerifyOtpBody body)
    {
        var destination = (body.Destination ?? "").Trim();
        var otp = (body.Otp ?? "").Trim();
        if (string.IsNullOrWhiteSpace(destination) || string.IsNullOrWhiteSpace(otp))
            return BadRequest(new { error = "otp_invalid", message = "Destination and OTP are required." });

        var key = destination.ToLowerInvariant();
        var now = DateTime.UtcNow;

        var record = await _db.OtpCodes.AsNoTracking()
            .Where(o => o.Destination == key && o.UsedAt == null && o.ExpiresAt > now)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefaultAsync();
        if (record is null)
            return BadRequest(new { error = "otp_invalid", message = "Invalid or expired code. Please request a new code." });

        // Spend one attempt atomically BEFORE checking the code, so parallel guesses can't exceed the limit.
        var spent = await _db.OtpCodes
            .Where(o => o.Id == record.Id && o.UsedAt == null && o.Attempts < MaxOtpAttempts)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.Attempts, o => o.Attempts + 1));
        if (spent == 0)
            return BadRequest(new { error = "otp_invalid", message = "Code has been locked due to too many failed attempts. Please request a new code." });

        if (!FixedEquals(record.CodeHash, OtpHash(key, otp)))
        {
            var remaining = MaxOtpAttempts - (record.Attempts + 1);
            return BadRequest(new
            {
                error = "otp_invalid",
                message = remaining > 0
                    ? $"Invalid code. {remaining} attempt(s) remaining."
                    : "Code has been locked due to too many failed attempts. Please request a new code."
            });
        }

        // Single use: only one request can flip UsedAt from NULL, even if two arrive at the same moment.
        var consumed = await _db.OtpCodes
            .Where(o => o.Id == record.Id && o.UsedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.UsedAt, (DateTime?)now));
        if (consumed == 0)
            return BadRequest(new { error = "otp_invalid", message = "Invalid or expired code. Please request a new code." });

        var isEmail = destination.Contains('@');
        var user = isEmail
            ? await _db.Users.FirstOrDefaultAsync(u => u.Email == destination)
            : await _db.Users.FirstOrDefaultAsync(u => u.Phone == destination);

        var isAdmin = destination.Equals("john@sababisha.com", StringComparison.OrdinalIgnoreCase) ||
                      destination.Equals("kibunajn@gmail.com", StringComparison.OrdinalIgnoreCase);

        if (user is null)
        {
            user = new User
            {
                FullName = string.IsNullOrWhiteSpace(body.FullName) ? destination.Split('@')[0] : body.FullName.Trim(),
                Email = isEmail ? destination : $"{Guid.NewGuid():N}@otp.local",
                Phone = isEmail ? null : destination,
                Role = isAdmin ? "Admin" : "User",
                AuthCodeLast4 = RandomNumberGenerator.GetInt32(1000, 10000).ToString(),
                PasswordHash = "",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                LastLoginAt = DateTime.UtcNow,
                IsActive = true,
                ThemePreference = "System"
            };
            _db.Users.Add(user);
        }
        else
        {
            user.LastLoginAt = DateTime.UtcNow;
            user.UpdatedAt = DateTime.UtcNow;
            if (string.IsNullOrWhiteSpace(user.AuthCodeLast4))
                user.AuthCodeLast4 = user.Id.ToString("N")[^4..].ToUpperInvariant();
            if (isAdmin || user.Id == Guid.Parse("D3AA997E-25D2-48E8-BBFA-B79EEE83909E") || user.Role is "Manager" or "Admin")
                user.Role = "Admin";
        }

        await _db.SaveChangesAsync();

        _db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = user.Id,
            ActionType = "auth.login",
            TargetType = "user",
            TargetId = user.Id,
            Details = $"User {user.Email} signed in via OTP from {AuthRateLimiting.ClientIp(HttpContext)}",
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();

        var (token, expiresAt) = await _sessions.CreateAsync(user.Id, Request.Headers.UserAgent.ToString());

        return Ok(new
        {
            token,
            expiresAt,
            user = new
            {
                id = user.Id,
                fullName = user.FullName,
                email = user.Email,
                role = NormalizeRole(user.Role),
                authCodeLast4 = user.AuthCodeLast4,
                themePreference = user.ThemePreference
            }
        });
    }

    [HttpGet("me")]
    [RequireSession]
    public async Task<IActionResult> GetCurrentUser()
    {
        var session = HttpContext.GetSessionUser()!;

        var user = await _db.Users.FindAsync(session.Id);
        if (user is null || !user.IsActive)
            return Unauthorized(new { message = "User inactive or not found." });

        return Ok(new
        {
            id = user.Id,
            fullName = user.FullName,
            email = user.Email,
            role = session.Role,
            authCodeLast4 = user.AuthCodeLast4,
            themePreference = user.ThemePreference,
            currentProjectId = session.CurrentProjectId,
            projectRole = session.ProjectRole
        });
    }

    [HttpPost("project-context")]
    [RequireSession]
    public async Task<IActionResult> SetProjectContext([FromBody] ProjectContextBody body)
    {
        var session = HttpContext.GetSessionUser()!;

        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == body.ProjectId && !p.IsDeleted);
        if (project is null) return NotFound(new { message = "Project not found." });

        string projectRole = "Viewer";
        if (session.Role == "Admin" || project.OwnerId == session.Id)
        {
            projectRole = "Owner";
        }
        else
        {
            var member = await _db.ProjectMembers.FirstOrDefaultAsync(m => m.ProjectId == body.ProjectId && m.UserId == session.Id);
            if (member is null)
                return Forbid();
            projectRole = member.Role;
        }

        await _sessions.SetProjectContextAsync(Bearer(Request), project.Id, projectRole);
        var updated = session with { CurrentProjectId = project.Id, ProjectRole = projectRole };

        return Ok(new
        {
            projectId = project.Id,
            projectName = project.Name,
            projectRole,
            user = new
            {
                id = updated.Id,
                fullName = updated.FullName,
                email = updated.Email,
                role = updated.Role,
                authCodeLast4 = updated.AuthCodeLast4,
                currentProjectId = updated.CurrentProjectId,
                projectRole = updated.ProjectRole
            }
        });
    }

    [HttpDelete("project-context")]
    public async Task<IActionResult> ClearProjectContext()
    {
        var token = Bearer(Request);
        var session = await _sessions.ValidateAsync(token, HttpContext.RequestAborted);
        if (token is not null && session is not null)
        {
            await _sessions.SetProjectContextAsync(token, null, null);
            var updated = session with { CurrentProjectId = null, ProjectRole = null };
            return Ok(new
            {
                success = true,
                user = new
                {
                    id = updated.Id,
                    fullName = updated.FullName,
                    email = updated.Email,
                    role = updated.Role,
                    authCodeLast4 = updated.AuthCodeLast4,
                    currentProjectId = (Guid?)null,
                    projectRole = (string?)null
                }
            });
        }
        return Ok(new { success = true });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await _sessions.RevokeAsync(Bearer(Request));
        return Ok(new { success = true });
    }

    public static string NormalizeRole(string role) =>
        role is "Admin" or "Manager" ? "Admin" : role is "User" or "Member" ? "User" : role;

    public static string? Bearer(HttpRequest request)
    {
        var header = request.Headers.Authorization.ToString();
        return header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? header["Bearer ".Length..].Trim() : null;
    }

    // The destination is mixed in so identical codes for different people never produce identical hashes.
    private static string OtpHash(string destination, string code) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{destination}:{code}")));

    private static bool FixedEquals(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));
}

public record SessionUser(Guid Id, string FullName, string Email, string Role, string AuthCodeLast4, Guid? CurrentProjectId = null, string? ProjectRole = null);
public record RequestOtpBody(string Destination, string? Purpose);
public record VerifyOtpBody(string Destination, string Otp, string? FullName);
public record ProjectContextBody(Guid ProjectId);
