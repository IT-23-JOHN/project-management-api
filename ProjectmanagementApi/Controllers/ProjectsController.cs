using Dapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using ProjectmanagementApi.Data;
using ProjectmanagementApi.Models;
using ProjectmanagementApi.Services;

namespace ProjectmanagementApi.Controllers;

[ApiController]
[RequireSession]
[Route("api/[controller]")]
public class ProjectsController : ControllerBase
{
    // "InProgress" and "Planning" are older values, kept so existing rows can still be saved.
    private static readonly string[] AllowedStatuses = { "Active", "Inactive", "Completed", "Stalled", "InProgress", "Planning" };
    private int RetentionDays => ProjectRetention.Days(_config);

    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly IEmailSender _email;
    private readonly ILogger<ProjectsController> _logger;

    public ProjectsController(AppDbContext db, IConfiguration config, IEmailSender email, ILogger<ProjectsController> logger)
    {
        _db = db;
        _config = config;
        _email = email;
        _logger = logger;
    }

    // The signed-in user. [RequireSession] guarantees a session exists.
    private SessionUser Me => HttpContext.GetSessionUser()!;

    // Admins see every project. Everyone else sees only projects they own or have joined.
    private IQueryable<Project> VisibleProjects(bool includeDeleted)
    {
        var me = Me;
        var myId = me.Id;
        var isAdmin = me.Role == "Admin";

        IQueryable<Project> q = _db.Projects;
        if (!(includeDeleted && isAdmin))
            q = q.Where(p => !p.IsDeleted);
        if (!isAdmin)
            q = q.Where(p => p.OwnerId == myId ||
                _db.ProjectMembers.Any(m => m.ProjectId == p.Id && m.UserId == myId && m.AcceptedAt != null));
        return q;
    }

    // The signed-in user's role on one project: "Admin", "Owner", "Editor", "Viewer", or null (no access).
    private async Task<string?> RoleOn(Project p)
    {
        var me = Me;
        if (me.Role == "Admin") return "Admin";
        if (p.OwnerId == me.Id) return "Owner";
        var m = await _db.ProjectMembers.FindAsync(p.Id, me.Id);
        return m is not null && m.AcceptedAt != null ? m.Role : null;
    }

    // "Manager" and "Member" are older role names from the first version of the database.
    private static bool CanEdit(string? role) => role is "Admin" or "Owner" or "Manager" or "Editor" or "Member";
    private static bool CanDelete(string? role) => role is "Admin" or "Owner" or "Manager";

    private IActionResult Forbidden(string message) => StatusCode(403, new { error = "forbidden", message });

    private static string? ValidateDetails(string? name, DateTime? start, DateTime? end)
    {
        if (string.IsNullOrWhiteSpace(name)) return "Project name is required.";
        if (name.Trim().Length > 200) return "Project name must be 200 characters or fewer.";
        if (start.HasValue && end.HasValue && end.Value < start.Value) return "The end date can't be before the start date.";
        return null;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProjectDto>>> GetAll(
        [FromQuery] bool includeDeleted = false,
        [FromQuery] string? status = null,
        [FromQuery] Guid? ownerId = null)
    {
        var query = VisibleProjects(includeDeleted);

        if (!string.IsNullOrWhiteSpace(status) && status != "All")
            query = query.Where(p => p.Status == status);

        if (ownerId.HasValue && ownerId.Value != Guid.Empty)
            query = query.Where(p => p.OwnerId == ownerId.Value);

        var projects = await query
            .OrderBy(p => p.SeqNo)
            .Select(ToDto)
            .ToListAsync();
        return Ok(projects);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProjectDto>> Get(Guid id)
    {
        var project = await VisibleProjects(includeDeleted: false)
            .Where(p => p.Id == id)
            .Select(ToDto)
            .FirstOrDefaultAsync();
        return project is null ? NotFound() : Ok(project);
    }

    [HttpGet("{id:guid}/dashboard")]
    public async Task<IActionResult> Dashboard(Guid id)
    {
        if (!await VisibleProjects(includeDeleted: false).AnyAsync(p => p.Id == id))
            return NotFound();

        var sql = "EXEC sp_GetProjectDashboard @ProjectId";
        using var connection = new SqlConnection(_config.GetConnectionString("DefaultConnection"));
        var dashboard = await connection.QueryFirstOrDefaultAsync<ProjectDashboardDto>(sql, new { ProjectId = id });
        return dashboard is null ? NotFound() : Ok(dashboard);
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateProjectRequest request)
    {
        var problem = ValidateDetails(request.Name, request.StartDate, request.TargetEndDate);
        if (problem is not null) return BadRequest(new { message = problem });

        var ownerId = Me.Id; // never trust an owner id sent by the browser

        var project = new Project
        {
            Name = request.Name.Trim(),
            Description = request.Description,
            OwnerId = ownerId,
            Status = "Active",
            StartDate = request.StartDate,
            TargetEndDate = request.TargetEndDate,
            // SeqNo is left unset on purpose: SQL Server assigns it atomically from the ProjectSeqNo sequence on INSERT.
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.Projects.Add(project);
        await _db.SaveChangesAsync();

        _db.ProjectMembers.Add(new ProjectMember
        {
            ProjectId = project.Id,
            UserId = ownerId,
            Role = "Owner",
            JoinedAt = DateTime.UtcNow,
            AcceptedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();
        await Audit(ownerId, "project.created", "project", project.Id, project.Name);

        var dto = await _db.Projects.Where(p => p.Id == project.Id).Select(ToDto).FirstAsync();
        return Created($"/api/projects/{project.Id}", dto);
    }

    // Edits name, description and dates. Status changes go through PUT .../status (needs a reason).
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateProjectRequest request)
    {
        var project = await _db.Projects.FindAsync(id);
        if (project is null || project.IsDeleted) return NotFound();
        if (!CanEdit(await RoleOn(project))) return Forbidden("You don't have permission to edit this project.");

        var problem = ValidateDetails(request.Name, request.StartDate, request.TargetEndDate);
        if (problem is not null) return BadRequest(new { message = problem });

        project.Name = request.Name.Trim();
        project.Description = request.Description;
        project.StartDate = request.StartDate;
        project.TargetEndDate = request.TargetEndDate;
        project.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await Audit(Me.Id, "project.updated", "project", project.Id, project.Name);
        return NoContent();
    }

    [HttpPut("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, UpdateStatusRequest request)
    {
        var project = await _db.Projects.FindAsync(id);
        if (project is null || project.IsDeleted) return NotFound();
        if (!CanEdit(await RoleOn(project))) return Forbidden("You don't have permission to change this project's status.");

        if (!AllowedStatuses.Contains(request.Status))
            return BadRequest(new { message = "Status must be Active, Inactive, Completed or Stalled." });
        if (string.IsNullOrWhiteSpace(request.Reason))
            return BadRequest(new { message = "Status reason is required when changing status." });

        project.Status = request.Status;
        project.StatusReason = request.Reason.Trim();
        project.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await Audit(Me.Id, "project.status_changed", "project", project.Id, $"{request.Status}: {request.Reason}");
        return NoContent();
    }

    // Soft delete: the row stays in the database, flagged IsDeleted, and can be restored.
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var project = await _db.Projects.FindAsync(id);
        if (project is null || project.IsDeleted) return NotFound();
        if (!CanDelete(await RoleOn(project))) return Forbidden("Only the project owner or an admin can delete a project.");

        project.IsDeleted = true;
        project.DeletedAt = DateTime.UtcNow;
        project.DeletedById = Me.Id;
        project.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await Audit(Me.Id, "project.deleted", "project", project.Id, project.Name);
        return Ok(new
        {
            id = project.Id,
            name = project.Name,
            isDeleted = true,
            deletedAt = project.DeletedAt,
            restoreUntil = project.DeletedAt!.Value.AddDays(RetentionDays),
            undoToken = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(16))
        });
    }

    // Admins can always restore. An owner can restore within the retention window.
    [HttpPost("{id:guid}/restore")]
    public async Task<IActionResult> Restore(Guid id)
    {
        var project = await _db.Projects.FindAsync(id);
        if (project is null || !project.IsDeleted) return NotFound();

        var role = await RoleOn(project);
        var withinRetention = project.DeletedAt.HasValue && project.DeletedAt.Value > DateTime.UtcNow.AddDays(-RetentionDays);
        if (!(role == "Admin" || (CanDelete(role) && withinRetention)))
            return Forbidden("You can't restore this project.");

        project.IsDeleted = false;
        project.DeletedAt = null;
        project.DeletedById = null;
        project.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await Audit(Me.Id, "project.restored", "project", project.Id, project.Name);
        return Ok(await _db.Projects.Where(p => p.Id == id).Select(ToDto).FirstAsync());
    }

    [HttpGet("{id:guid}/collaborators")]
    public async Task<ActionResult<IEnumerable<CollaboratorDto>>> Collaborators(Guid id)
    {
        if (!await VisibleProjects(includeDeleted: false).AnyAsync(p => p.Id == id))
            return NotFound();

        var members = await _db.ProjectMembers
            .Where(m => m.ProjectId == id)
            .Select(m => new CollaboratorDto(m.UserId, m.User.FullName, m.User.Email, m.Role, m.AcceptedAt ?? m.JoinedAt, m.AcceptedAt != null))
            .ToListAsync();
        return Ok(members);
    }

    [HttpPost("{id:guid}/collaborators")]
    public async Task<IActionResult> Invite(Guid id, InviteCollaboratorRequest request)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted);
        if (project is null) return NotFound();

        var myRole = await RoleOn(project);
        if (!CanEdit(myRole)) return Forbidden("You don't have permission to invite collaborators.");
        if (project.Status == "Inactive")
            return Conflict(new { error = "project_inactive", message = "Cannot invite while the project is inactive." });

        var role = string.IsNullOrWhiteSpace(request.Role) ? "Editor" : request.Role.Trim();
        if (role is not ("Owner" or "Editor" or "Viewer"))
            return BadRequest(new { message = "Role must be Owner, Editor or Viewer." });
        if (role == "Owner" && !CanDelete(myRole))
            return Forbidden("Only an owner or an admin can add another owner.");

        var email = request.Email.Trim();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (user is null)
            return NotFound(new { message = "No user found with that email. They must sign in or register first." });

        var existing = await _db.ProjectMembers.FindAsync(id, user.Id);
        if (existing is not null)
            return Conflict(new { message = "User is already a collaborator on this project." });

        _db.ProjectMembers.Add(new ProjectMember
        {
            ProjectId = id,
            UserId = user.Id,
            Role = role,
            InvitedById = Me.Id,
            JoinedAt = DateTime.UtcNow,
            AcceptedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();
        await Audit(Me.Id, "collaborator.invited", "project", id, email);
        await NotifyInviteAsync(user.Email, project.Name, role);
        return Ok(new CollaboratorDto(user.Id, user.FullName, user.Email, role, DateTime.UtcNow, true));
    }

    [HttpDelete("{id:guid}/collaborators/{userId:guid}")]
    public async Task<IActionResult> RemoveCollaborator(Guid id, Guid userId)
    {
        var project = await _db.Projects.FindAsync(id);
        if (project is null || project.IsDeleted) return NotFound();

        // Owners and admins can remove anyone. Anyone else can only remove themselves (leave).
        if (!(CanDelete(await RoleOn(project)) || userId == Me.Id))
            return Forbidden("You don't have permission to remove this collaborator.");

        var member = await _db.ProjectMembers.FindAsync(id, userId);
        if (member is null) return NotFound();

        if (userId == project.OwnerId)
            return BadRequest(new { message = "The project creator can't be removed." });

        if (member.Role is "Owner" or "Manager")
        {
            var ownerCount = await _db.ProjectMembers.CountAsync(m => m.ProjectId == id && (m.Role == "Owner" || m.Role == "Manager"));
            if (ownerCount <= 1)
                return BadRequest(new { message = "Cannot remove the only Owner of the project." });
        }

        _db.ProjectMembers.Remove(member);
        await _db.SaveChangesAsync();

        // They no longer have access, so their tasks here become unassigned and any "working in this project" session is cleared.
        await _db.Tasks.Where(t => t.ProjectId == id && t.AssigneeId == userId)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.AssigneeId, (Guid?)null));
        await _db.UserSessions.Where(x => x.UserId == userId && x.CurrentProjectId == id)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.CurrentProjectId, (Guid?)null)
                .SetProperty(x => x.ProjectRole, (string?)null));

        await Audit(Me.Id, "collaborator.removed", "project", id, userId.ToString());
        return NoContent();
    }

    [HttpPut("{id:guid}/collaborators/{userId:guid}")]
    public async Task<IActionResult> ChangeCollaboratorRole(Guid id, Guid userId, UpdateCollaboratorRequest request)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted);
        if (project is null) return NotFound();

        // Only owners and admins can change roles.
        if (!CanDelete(await RoleOn(project)))
            return Forbidden("Only an owner or an admin can change roles.");

        var role = (request.Role ?? "").Trim();
        if (role is not ("Owner" or "Editor" or "Viewer"))
            return BadRequest(new { message = "Role must be Owner, Editor or Viewer." });

        if (userId == project.OwnerId)
            return BadRequest(new { message = "The project creator is always an Owner." });

        var member = await _db.ProjectMembers.Include(m => m.User).FirstOrDefaultAsync(m => m.ProjectId == id && m.UserId == userId);
        if (member is null) return NotFound();

        var oldRole = member.Role;
        if (oldRole == role)
            return Ok(new CollaboratorDto(member.UserId, member.User.FullName, member.User.Email, member.Role, member.AcceptedAt ?? member.JoinedAt, member.AcceptedAt != null));

        // Never leave a project without an owner.
        if (oldRole is "Owner" or "Manager" && role != "Owner")
        {
            var ownerCount = await _db.ProjectMembers.CountAsync(m => m.ProjectId == id && (m.Role == "Owner" || m.Role == "Manager"));
            if (ownerCount <= 1)
                return BadRequest(new { message = "A project needs at least one Owner." });
        }

        member.Role = role;
        await _db.SaveChangesAsync();

        // If they are working inside this project right now, keep their session in step with the new role.
        await _db.UserSessions.Where(x => x.UserId == userId && x.CurrentProjectId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.ProjectRole, (string?)role));

        await Audit(Me.Id, "collaborator.role_changed", "project", id, $"{member.User.Email}: {oldRole} -> {role}");
        return Ok(new CollaboratorDto(member.UserId, member.User.FullName, member.User.Email, member.Role, member.AcceptedAt ?? member.JoinedAt, member.AcceptedAt != null));
    }

    // Best-effort: a slow or broken mail server must never make the invite itself fail.
    // Turn it off with  "Email": { "SendInviteEmails": false }  in appsettings.json.
    private async Task NotifyInviteAsync(string toEmail, string projectName, string role)
    {
        if (!_email.IsConfigured || !_config.GetValue<bool>("Email:SendInviteEmails", true)) return;
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var appUrl = _config["App:FrontendUrl"] ?? "http://localhost:5173";
            await _email.SendInviteAsync(toEmail, Me.FullName, projectName, role, appUrl, timeout.Token);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Collaborator was added, but the invitation email to {Email} could not be sent.", toEmail);
        }
    }

    private async Task Audit(Guid? actor, string action, string targetType, Guid targetId, string? details)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            ActorUserId = actor,
            ActionType = action,
            TargetType = targetType,
            TargetId = targetId,
            Details = details,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();
    }

    private static System.Linq.Expressions.Expression<Func<Project, ProjectDto>> ToDto =>
        p => new ProjectDto(
            p.Id, p.SeqNo, p.Name, p.Description, p.Status, p.Owner.FullName, p.OwnerId,
            p.StartDate, p.TargetEndDate, p.IsDeleted, p.DeletedAt);
}

public record ProjectDto(
    Guid Id, int SeqNo, string Name, string? Description, string Status, string Owner, Guid OwnerId,
    DateTime? StartDate, DateTime? TargetEndDate, bool IsDeleted, DateTime? DeletedAt);
public record CreateProjectRequest(string Name, string? Description, Guid OwnerId, DateTime? StartDate, DateTime? TargetEndDate);
public record UpdateProjectRequest(string Name, string? Description, string? Status, DateTime? StartDate, DateTime? TargetEndDate);
public record UpdateStatusRequest(string Status, string? Reason);
public record ProjectDashboardDto(Guid Id, string Name, string Status, int TotalTasks, int DoneTasks, int InProgressTasks, decimal? CompletionPercent);
public record CollaboratorDto(Guid UserId, string FullName, string Email, string Role, DateTime JoinedAt, bool Accepted);
public record InviteCollaboratorRequest(string Email, string? Role);
public record UpdateCollaboratorRequest(string Role);