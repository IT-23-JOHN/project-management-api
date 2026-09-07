using Microsoft.EntityFrameworkCore;
using ProjectmanagementApi.Models;

namespace ProjectmanagementApi.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectMember> ProjectMembers => Set<ProjectMember>();
    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<TaskComment> TaskComments => Set<TaskComment>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.ToTable("Users");
            e.HasIndex(x => x.Email).IsUnique();
        });

        b.Entity<Project>(e =>
        {
            e.ToTable("Projects");
            e.Property(x => x.StartDate).HasColumnType("date");
            e.Property(x => x.TargetEndDate).HasColumnType("date");
            e.HasOne(x => x.Owner).WithMany()
             .HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.NoAction);
        });

        b.Entity<ProjectMember>(e =>
        {
            e.ToTable("ProjectMembers");
            e.HasKey(x => new { x.ProjectId, x.UserId });
            e.HasOne(x => x.Project).WithMany()
             .HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.User).WithMany()
             .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<TaskItem>(e =>
        {
            e.ToTable("Tasks");
            e.Property(x => x.DueDate).HasColumnType("date");
            e.Property(x => x.EstimatedHours).HasColumnType("decimal(5,2)");
            e.HasOne(x => x.Project).WithMany()
             .HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Assignee).WithMany()
             .HasForeignKey(x => x.AssigneeId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<TaskComment>(e =>
        {
            e.ToTable("TaskComments");
            e.HasOne(x => x.Task).WithMany()
             .HasForeignKey(x => x.TaskId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Author).WithMany()
             .HasForeignKey(x => x.AuthorId).OnDelete(DeleteBehavior.NoAction);
        });
    }
}