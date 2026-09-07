using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProjectmanagementApi.Data;
using ProjectmanagementApi.Models;

namespace ProjectmanagementApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TasksController : ControllerBase
{
    private readonly AppDbContext _db;
    public TasksController(AppDbContext db) => _db = db;

    // GET api/tasks?projectId=1
    [HttpGet]
    public async Task<ActionResult<IEnumerable<TaskDto>>> GetByProject([FromQuery] int projectId)
    {
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

    // PUT api/tasks/1/status
    [HttpPut("{id}/status")]
    public async Task<IActionResult> UpdateStatus(int id, UpdateStatusRequest request)
    {
        var task = await _db.Tasks.FindAsync(id);
        if (task is null) return NotFound();
        task.Status = request.Status;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // PUT api/tasks/1/assign
    [HttpPut("{id}/assign")]
    public async Task<IActionResult> Assign(int id, AssignTaskRequest request)
    {
        var task = await _db.Tasks.FindAsync(id);
        if (task is null) return NotFound();
        task.AssigneeId = request.AssigneeId;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // DELETE api/tasks/1
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var task = await _db.Tasks.FindAsync(id);
        if (task is null) return NotFound();
        _db.Tasks.Remove(task);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}

public record TaskDto(int Id, int ProjectId, string Title, string Status, string Priority,
                      DateTime? DueDate, decimal? EstimatedHours, string? Assignee);
public record CreateTaskRequest(int ProjectId, string Title, string? Description, int? AssigneeId,
                                string? Priority, DateTime? DueDate, decimal? EstimatedHours);
public record AssignTaskRequest(int? AssigneeId);