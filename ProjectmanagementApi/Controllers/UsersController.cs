using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProjectmanagementApi.Data;
using ProjectmanagementApi.Models;

namespace ProjectmanagementApi.Controllers;

[ApiController]
[RequireSession]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    public UsersController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<UserDto>>> GetAll()
    {
        var users = await _db.Users
            .Select(u => new UserDto(
                u.Id, u.FullName, u.Email, u.Role,
                u.AuthCodeLast4,
                u.LastLoginAt, u.CreatedAt))
            .ToListAsync();
        return Ok(users);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<UserDto>> Get(Guid id)
    {
        var user = await _db.Users
            .Where(u => u.Id == id)
            .Select(u => new UserDto(
                u.Id, u.FullName, u.Email, u.Role,
                u.AuthCodeLast4,
                u.LastLoginAt, u.CreatedAt))
            .FirstOrDefaultAsync();
        return user is null ? NotFound() : Ok(user);
    }

    [HttpPost]
    [RequireAdmin]
    public async Task<IActionResult> Create(CreateUserRequest request)
    {
        var role = string.IsNullOrWhiteSpace(request.Role) ? "User" : request.Role.Trim();
        if (role is not ("Admin" or "User"))
            return BadRequest(new { message = "Role must be Admin or User." });

        var user = new User
        {
            FullName = request.FullName,
            Email = request.Email,
            Role = role,
            AuthCodeLast4 = Random.Shared.Next(1000, 10000).ToString(),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return Created($"/api/users/{user.Id}", new UserDto(user.Id, user.FullName, user.Email, user.Role, user.AuthCodeLast4, user.LastLoginAt, user.CreatedAt));
    }

    [HttpPut("{id:guid}")]
    [RequireAdmin]
    public async Task<IActionResult> Update(Guid id, CreateUserRequest request)
    {
        if (request.Role is not ("Admin" or "User"))
            return BadRequest(new { message = "Role must be Admin or User." });

        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();
        user.FullName = request.FullName;
        user.Email = request.Email;
        user.Role = request.Role;
        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPatch("me")]
    public async Task<IActionResult> UpdateMe(UpdateMeRequest request)
    {
        var session = HttpContext.GetSessionUser()!;

        var user = await _db.Users.FindAsync(session.Id);
        if (user is null) return NotFound();

        if (!string.IsNullOrWhiteSpace(request.FullName))
            user.FullName = request.FullName.Trim();

        if (!string.IsNullOrWhiteSpace(request.ThemePreference))
        {
            var theme = request.ThemePreference.Trim();
            if (theme is not ("Light" or "Dark" or "System"))
                return BadRequest(new { message = "Theme must be Light, Dark or System." });
            user.ThemePreference = theme;
        }

        if (request.Phone != null)
            user.Phone = request.Phone.Trim();

        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new
        {
            user.Id,
            user.FullName,
            user.Email,
            user.Role,
            user.AuthCodeLast4,
            user.ThemePreference,
            user.Phone
        });
    }

    [HttpDelete("{id:guid}")]
    [RequireAdmin]
    public async Task<IActionResult> Delete(Guid id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();
        _db.Users.Remove(user);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}

public record UserDto(Guid Id, string FullName, string Email, string Role, string AuthCodeLast4, DateTime? LastLoginAt, DateTime CreatedAt);
public record CreateUserRequest(string FullName, string Email, string Role);
public record UpdateMeRequest(string? FullName, string? ThemePreference, string? Phone);