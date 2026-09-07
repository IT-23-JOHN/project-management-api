using Dapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using ProjectmanagementApi.Data;
using ProjectmanagementApi.Models;

namespace ProjectmanagementApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProjectsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;

    public ProjectsController(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    // GET api/projects
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProjectDto>>> GetAll()
    {
        var projects = await _db.Projects
            .Select(p => new ProjectDto(p.Id, p.Name, p.Status, p.Owner.FullName, p.StartDate, p.TargetEndDate))
            .ToListAsync();
        return Ok(projects);
    }

    // GET api/projects/1
    [HttpGet("{id}")]
    public async Task<ActionResult<ProjectDto>> Get(int id)
    {
        var project = await _db.Projects
            .Where(p => p.Id == id)
            .Select(p => new ProjectDto(p.Id, p.Name, p.Status, p.Owner.FullName, p.StartDate, p.TargetEndDate))
            .FirstOrDefaultAsync();

        return project is null ? NotFound() : Ok(project);
    }

    // GET api/projects/1/dashboard  →  Dapper + stored procedure
    [HttpGet("{id}/dashboard")]
    public async Task<IActionResult> Dashboard(int id)
    {
        var sql = "EXEC sp_GetProjectDashboard @ProjectId";

        using var connection = new SqlConnection(_config.GetConnectionString("DefaultConnection"));
        var dashboard = await connection.QueryFirstOrDefaultAsync<ProjectDashboardDto>(sql, new { ProjectId = id });

        return dashboard is null ? NotFound() : Ok(dashboard);
    }

    // POST api/projects
    [HttpPost]
    public async Task<IActionResult> Create(CreateProjectRequest request)
    {
        var project = new Project
        {
            Name = request.Name,
            Description = request.Description,
            OwnerId = request.OwnerId,
            Status = "Active",
            StartDate = request.StartDate,
            TargetEndDate = request.TargetEndDate,
            CreatedAt = DateTime.UtcNow
        };

        _db.Projects.Add(project);
        await _db.SaveChangesAsync();

        _db.ProjectMembers.Add(new ProjectMember
        {
            ProjectId = project.Id,
            UserId = request.OwnerId,
            Role = "Manager",
            JoinedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();

        return Created($"/api/projects/{project.Id}", project.Id);
    }

    // PUT api/projects/1/status
    [HttpPut("{id}/status")]
    public async Task<IActionResult> UpdateStatus(int id, UpdateStatusRequest request)
    {
        var project = await _db.Projects.FindAsync(id);
        if (project is null) return NotFound();
        project.Status = request.Status;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // DELETE api/projects/1
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var project = await _db.Projects.FindAsync(id);
        if (project is null) return NotFound();
        _db.Projects.Remove(project);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}

public record ProjectDto(int Id, string Name, string Status, string Owner, DateTime? StartDate, DateTime? TargetEndDate);
public record CreateProjectRequest(string Name, string? Description, int OwnerId, DateTime? StartDate, DateTime? TargetEndDate);
public record UpdateStatusRequest(string Status);
public record ProjectDashboardDto(int Id, string Name, string Status, int TotalTasks, int DoneTasks, int InProgressTasks, decimal? CompletionPercent);