using Microsoft.EntityFrameworkCore;
using ProjectmanagementApi.Controllers;
using ProjectmanagementApi.Data;

namespace ProjectmanagementApi.GraphQL;

public class Query
{
    public async Task<List<ProjectDto>> GetProjectsAsync(AppDbContext db) =>
        await db.Projects
            .Where(p => !p.IsDeleted)
            .OrderBy(p => p.SeqNo)
            .Select(p => new ProjectDto(p.Id, p.SeqNo, p.Name, p.Description, p.Status, p.Owner.FullName, p.OwnerId, p.StartDate, p.TargetEndDate, p.IsDeleted, p.DeletedAt))
            .ToListAsync();

    public async Task<ProjectDto?> GetProjectAsync(Guid id, AppDbContext db) =>
        await db.Projects
            .Where(p => p.Id == id)
            .Select(p => new ProjectDto(p.Id, p.SeqNo, p.Name, p.Description, p.Status, p.Owner.FullName, p.OwnerId, p.StartDate, p.TargetEndDate, p.IsDeleted, p.DeletedAt))
            .FirstOrDefaultAsync();

    public async Task<List<TaskDto>> GetTasksAsync(Guid projectId, AppDbContext db) =>
        await db.Tasks
            .Where(t => t.ProjectId == projectId)
            .Select(t => new TaskDto(t.Id, t.ProjectId, t.Title, t.Status, t.Priority,
                                     t.DueDate, t.EstimatedHours,
                                     t.Assignee != null ? t.Assignee.FullName : null))
            .ToListAsync();

    public async Task<List<UserDto>> GetUsersAsync(AppDbContext db) =>
        await db.Users
            .Select(u => new UserDto(u.Id, u.FullName, u.Email, u.Role, u.AuthCodeLast4, u.LastLoginAt, u.CreatedAt))
            .ToListAsync();
}