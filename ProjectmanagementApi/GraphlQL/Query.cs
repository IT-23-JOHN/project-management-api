using Microsoft.EntityFrameworkCore;
using ProjectmanagementApi.Controllers;
using ProjectmanagementApi.Data;

namespace ProjectmanagementApi.GraphQL;

public class Query
{
    public async Task<List<ProjectDto>> GetProjectsAsync(AppDbContext db) =>
        await db.Projects
            .Select(p => new ProjectDto(p.Id, p.Name, p.Status, p.Owner.FullName, p.StartDate, p.TargetEndDate))
            .ToListAsync();

    public async Task<ProjectDto?> GetProjectAsync(int id, AppDbContext db) =>
        await db.Projects
            .Where(p => p.Id == id)
            .Select(p => new ProjectDto(p.Id, p.Name, p.Status, p.Owner.FullName, p.StartDate, p.TargetEndDate))
            .FirstOrDefaultAsync();

    public async Task<List<TaskDto>> GetTasksAsync(int projectId, AppDbContext db) =>
        await db.Tasks
            .Where(t => t.ProjectId == projectId)
            .Select(t => new TaskDto(t.Id, t.ProjectId, t.Title, t.Status, t.Priority,
                                     t.DueDate, t.EstimatedHours,
                                     t.Assignee != null ? t.Assignee.FullName : null))
            .ToListAsync();

    public async Task<List<UserDto>> GetUsersAsync(AppDbContext db) =>
        await db.Users
            .Select(u => new UserDto(u.Id, u.FullName, u.Email, u.Role, u.CreatedAt))
            .ToListAsync();
}