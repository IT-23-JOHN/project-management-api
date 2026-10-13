using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProjectmanagementApi.Auth;
using ProjectmanagementApi.Data;
using ProjectmanagementApi.Models;

namespace ProjectmanagementApi.Controllers;

[ApiController]
[RequireSession]
[Route("api/[controller]")]
public class TasksController : ControllerBase
{
    private readonly AppDbContext _db;
    public TasksController(AppDbContext db) => _db = db;

    // The signed-in user. [RequireSession] guarantees a session exists.
    private SessionUser Me => HttpContext.GetSessionUser()!;

    // Loads a (non-deleted) project and the caller's role on it.
    // Role is null when the caller has no access to it.
    private async Task<(Project? Project, string? Role)> AccessTo(Guid projectId)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == projectId && !p.IsDeleted);
        if (project is null) return (null, null);
        return (project, await ProjectAccess.RoleOnAsync(_db, Me, project));
    }

    // People with no access get the same answer as a project that doesn't exist,
    // so project and task IDs can't be probed.
    private NotFoundObjectResult NoProject() =>
        NotFound(new { error = "project_not_found", message = "Project not found or deleted." });

    private ObjectResult ViewOnly() =>
        StatusCode(403, new { error = "forbidden", message = "You have view-only access to this project, so tasks can't be changed." });

    private Task<bool> AssigneeIsValid(Guid? assigneeId) =>
        assigneeId is null ? Task.FromResult(true) : _db.Users.AnyAsync(u => u.Id == assigneeId && u.IsActive);

    private BadRequestObjectResult BadAssignee() =>
        BadRequest(new { error = "invalid_assignee", message = "That user doesn't exist or is inactive." });

    // GET api/tasks/access?projectId={guid}  ->  what the caller may do on this project's board
    [HttpGet("access")]
    public async Task<IActionResult> Access([FromQuery] Guid projectId)
    {
        var (project, role) = await AccessTo(projectId);
        if (project is null || role is null) return NoProject();
        return Ok(new TaskAccessDto(role, ProjectAccess.CanEdit(role)));
    }

    // GET api/tasks?projectId={guid}
    [HttpGet]
    public async Task<ActionResult<IEnumerable<TaskDto>>> GetByProject([FromQuery] Guid projectId)
    {
        var (project, role) = await AccessTo(projectId);
        if (project is null || role is null) return NoProject();

        var tasks = await _db.Tasks
            .Where(t => t.ProjectId == projectId)
            .Select(t => new TaskDto(t.Id, t.ProjectId, t.Title, t.Status, t.Priority,
                                     t.DueDate, t.EstimatedHours,
                                     t.Assignee != null ? t.Assignee.FullName : null))
            .ToListAsync();
        return Ok(tasks);
    }

    // POST api/tasks
    [HttpPost]
    public async Task<IActionResult> Create(CreateTaskRequest request)
    {
        var (project, role) = await AccessTo(request.ProjectId);
        if (project is null || role is null) return NoProject();
        if (!ProjectAccess.CanEdit(role)) return ViewOnly();

        if (project.Status == "Inactive")
            return StatusCode(409, new { error = "project_inactive", message = "Cannot create tasks while the project is inactive." });

        if (!await AssigneeIsValid(request.AssigneeId)) return BadAssignee();

        var task = new TaskItem
        {
            ProjectId = request.ProjectId,
            AssigneeId = request.AssigneeId,
            Title = request.Title,
            Description = request.Description,
            Status = "Todo",
            Priority = request.Priority ?? "Medium",
            DueDate = request.DueDate,
            EstimatedHours = request.EstimatedHours,
            CreatedAt = DateTime.UtcNow
        };

        _db.Tasks.Add(task);
        await _db.SaveChangesAsync();
        return Created($"/api/tasks/{task.Id}", task.Id);
    }

    // Finds a task and checks the caller may change it. On success `task` is set; otherwise `denied` holds the answer.
    private async Task<(TaskItem? Task, IActionResult? Denied)> ForChange(Guid id)
    {
        var task = await _db.Tasks.FindAsync(id);
        if (task is null) return (null, NotFound());

        var (project, role) = await AccessTo(task.ProjectId);
        if (project is null || role is null) return (null, NotFound());
        if (!ProjectAccess.CanEdit(role)) return (null, ViewOnly());
        return (task, null);
    }

    // PUT api/tasks/{id}/status
    [HttpPut("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, UpdateStatusRequest request)
    {
        var (task, denied) = await ForChange(id);
        if (denied is not null) return denied;
        task!.Status = request.Status;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // PUT api/tasks/{id}/assign
    [HttpPut("{id:guid}/assign")]
    public async Task<IActionResult> Assign(Guid id, AssignTaskRequest request)
    {
        var (task, denied) = await ForChange(id);
        if (denied is not null) return denied;
        if (!await AssigneeIsValid(request.AssigneeId)) return BadAssignee();
        task!.AssigneeId = request.AssigneeId;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // DELETE api/tasks/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var (task, denied) = await ForChange(id);
        if (denied is not null) return denied;
        _db.Tasks.Remove(task!);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}

public record TaskDto(Guid Id, Guid ProjectId, string Title, string Status, string Priority,
                      DateTime? DueDate, decimal? EstimatedHours, string? Assignee);
public record CreateTaskRequest(Guid ProjectId, string Title, string? Description, Guid? AssigneeId,
                                string? Priority, DateTime? DueDate, decimal? EstimatedHours);
public record AssignTaskRequest(Guid? AssigneeId);
public record TaskAccessDto(string Role, bool CanEdit);
