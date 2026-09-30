using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProjectmanagementApi.Data;
using ProjectmanagementApi.Models;

namespace ProjectmanagementApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    public UsersController(AppDbContext db) => _db = db;

    // GET api/users
    [HttpGet]
    public async Task<ActionResult<IEnumerable<UserDto>>> GetAll()
    {
        var users = await _db.Users
            .Select(u => new UserDto(u.Id, u.FullName, u.Email, u.Role, u.CreatedAt))
            .ToListAsync();
        return Ok(users);
    }

    // GET api/users/{id}
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<UserDto>> Get(Guid id)
    {
        var user = await _db.Users
            .Where(u => u.Id == id)
            .Select(u => new UserDto(u.Id, u.FullName, u.Email, u.Role, u.CreatedAt))
            .FirstOrDefaultAsync();

        return user is null ? NotFound() : Ok(user);
    }

    // POST api/users
    [HttpPost]
    public async Task<IActionResult> Create(CreateUserRequest request)
    {
        var user = new User
        {
            FullName = request.FullName,
            Email = request.Email,
            Role = request.Role,
            CreatedAt = DateTime.UtcNow
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return Created($"/api/users/{user.Id}", new UserDto(user.Id, user.FullName, user.Email, user.Role, user.CreatedAt));
    }

    // PUT api/users/{id}
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, CreateUserRequest request)
    {
        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();

        user.FullName = request.FullName;
        user.Email = request.Email;
        user.Role = request.Role;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    // DELETE api/users/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();

        return NoContent();
    }
}

public record UserDto(Guid Id, string FullName, string Email, string Role, DateTime CreatedAt);
public record CreateUserRequest(string FullName, string Email, string Role);