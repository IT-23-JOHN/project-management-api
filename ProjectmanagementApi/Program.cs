using Microsoft.EntityFrameworkCore;
using ProjectmanagementApi.Data;
using ProjectmanagementApi.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<RealtimeBus>();
builder.Services.AddControllers(options => options.Filters.Add<PublishChangesFilter>());
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.Configure<EmailSettings>(builder.Configuration.GetSection("Email"));
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
builder.Services.AddScoped<SessionService>();
builder.Services.AddHostedService<SessionCleanupService>();
builder.Services.AddHostedService<ProjectPurgeService>();

builder.Services.AddGraphQLServer()
    .AddQueryType<ProjectmanagementApi.GraphQL.Query>();

builder.Services.AddAuthRateLimiting(builder.Configuration);

builder.Services.AddCors(o => o.AddPolicy("frontend", p =>
    p.WithOrigins("http://localhost:5173", "http://localhost:5174").AllowAnyHeader().AllowAnyMethod()));
var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Only when running behind a reverse proxy (RateLimiting:BehindProxy = true): read the visitor's real IP.
if (app.Configuration.GetValue<bool>("RateLimiting:BehindProxy"))
    app.UseForwardedHeaders();

app.UseCors("frontend");

// After CORS, so the browser can still read the "too many attempts" message.
app.UseRateLimiter();

app.UseAuthorization();

app.MapControllers();

app.MapGraphQL();
app.UseSwaggerUI();
app.MapGet("/api/health", async (AppDbContext db) =>
{
    var dbOk = await db.Database.CanConnectAsync();
    return Results.Ok(new
    {
        status = "Healthy",
        database = dbOk ? "SQL Server connected" : "SQL Server UNREACHABLE",
        checkedAt = DateTime.UtcNow
    });
});

app.Run();
