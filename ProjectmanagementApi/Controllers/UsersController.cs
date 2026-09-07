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

    // GET api/users/1
    [HttpGet("{id}")]
    public async Task<ActionResult<UserDto>> Get(int id)
    {
        var user = await _db.Users
            .Where(u => u.Id == id)
            .Select(u => new UserDto(u.Id, u.FullName, u.Email, u.Role, u.CreatedAt))
            .FirstOrDefaultAsync();

        return user is null ? NotFound() : Ok(user);
    }
}

public record UserDto(int Id, string FullName, string Email, string Role, DateTime CreatedAt);