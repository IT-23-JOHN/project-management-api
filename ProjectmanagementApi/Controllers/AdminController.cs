using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProjectmanagementApi.Data;
using ProjectmanagementApi.Models;
using ProjectmanagementApi.Services;

namespace ProjectmanagementApi.Controllers;

[ApiController]
[RequireAdmin]
[Route("api/admin")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;

    public AdminController(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    [HttpGet("metrics")]
    public async Task<IActionResult> Metrics()
    {
        var usersCount = await _db.Users.CountAsync(u => u.IsActive);
        var created = await _db.Projects.CountAsync(p => !p.IsDeleted);
        var completed = await _db.Projects.CountAsync(p => !p.IsDeleted && p.Status == "Completed");
        var stalled = await _db.Projects.CountAsync(p => !p.IsDeleted && p.Status == "Stalled");

        return Ok(new
        {
            usersCount,
            projectsCreatedCount = created,
            projectsCompletedCount = completed,
            projectsStalledCount = stalled,
            generatedAt = DateTime.UtcNow
        });
    }

    [HttpGet("audit-logs")]
    public async Task<IActionResult> GetAuditLogs()
    {
        var logs = await _db.AuditLogs
            .OrderByDescending(a => a.CreatedAt)
            .Take(30)
            .ToListAsync();
        return Ok(logs);
    }

    [HttpGet("deleted-projects")]
    public async Task<IActionResult> GetDeletedProjects()
    {
        var days = ProjectRetention.Days(_config);
        var projects = await _db.Projects
            .Where(p => p.IsDeleted)
            .OrderByDescending(p => p.DeletedAt)
            .Select(p => new
            {
                id = p.Id,
                seqNo = p.SeqNo,
                name = p.Name,
                status = p.Status,
                owner = p.Owner.FullName,
                deletedAt = p.DeletedAt,
                restoreUntil = p.DeletedAt.HasValue ? p.DeletedAt.Value.AddDays(days) : DateTime.UtcNow.AddDays(days),
                retentionDays = days
            })
            .ToListAsync();
        return Ok(projects);
    }

    // Permanent delete. Only works on a project that is already soft-deleted, and the admin must type its exact name.
    [HttpDelete("deleted-projects/{id:guid}")]
    public async Task<IActionResult> PurgeDeletedProject(Guid id, PurgeProjectRequest request)
    {
        var project = await _db.Projects.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
        if (project is null) return NotFound(new { message = "Project not found." });

        if (!project.IsDeleted)
            return BadRequest(new { message = "Only deleted projects can be purged. Delete the project first." });

        if ((request.ConfirmName ?? "").Trim() != project.Name)
            return BadRequest(new { message = "The name you typed doesn't match this project." });

        var actor = HttpContext.GetSessionUser()!.Id;
        var name = project.Name;

        // Tasks, members and comments are removed by the database (ON DELETE CASCADE).
        await _db.Projects.Where(p => p.Id == id).ExecuteDeleteAsync();

        _db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = actor,
            ActionType = "project.purged",
            TargetType = "project",
            TargetId = id,
            Details = $"{name} (permanent, deleted by admin)",
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();

        return NoContent();
    }
}

public record PurgeProjectRequest(string? ConfirmName);
