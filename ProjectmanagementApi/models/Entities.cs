namespace ProjectmanagementApi.Models;

public class User
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = "Member";
    public DateTime CreatedAt { get; set; }
}

public class Project
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int OwnerId { get; set; }
    public string Status { get; set; } = "Active";
    public DateTime? StartDate { get; set; }
    public DateTime? TargetEndDate { get; set; }
    public DateTime CreatedAt { get; set; }
    public User Owner { get; set; } = null!;
}

public class ProjectMember
{
    public int ProjectId { get; set; }
    public int UserId { get; set; }
    public string Role { get; set; } = "Member";
    public DateTime JoinedAt { get; set; }
    public Project Project { get; set; } = null!;
    public User User { get; set; } = null!;
}

public class TaskItem
{
    public int Id { get; set; }
    public int ProjectId { get; set; }
    public int? AssigneeId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Status { get; set; } = "Todo";
    public string Priority { get; set; } = "Medium";
    public DateTime? DueDate { get; set; }
    public decimal? EstimatedHours { get; set; }
    public DateTime CreatedAt { get; set; }
    public Project Project { get; set; } = null!;
    public User? Assignee { get; set; }
}

public class TaskComment
{
    public int Id { get; set; }
    public int TaskId { get; set; }
    public int AuthorId { get; set; }
    public string Body { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public TaskItem Task { get; set; } = null!;
    public User Author { get; set; } = null!;
}