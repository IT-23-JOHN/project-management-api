using System.Threading.Channels;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using ProjectmanagementApi.Services;

namespace ProjectmanagementApi.Controllers;

/// <summary>
/// GET /api/events - a one-way live stream (Server-Sent Events). Requires a signed-in user.
/// The browser sends its normal "Authorization: Bearer ..." header; every message is just
/// "event: change" plus a topic name, or a keep-alive comment.
/// </summary>
[ApiController]
[RequireSession]
[Route("api/events")]
public class EventsController : ControllerBase
{
    [HttpGet]
    public async Task Stream(
        [FromServices] RealtimeBus bus,
        [FromServices] IHostApplicationLifetime lifetime)
    {
        using var subscription = bus.Subscribe(AuthRateLimiting.ClientIp(HttpContext));
        if (subscription is null)
        {
            Response.StatusCode = StatusCodes.Status429TooManyRequests;
            await Response.WriteAsJsonAsync(new { error = "too_many_streams", message = "Too many live connections from this network." });
            return;
        }

        Response.Headers.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers["X-Accel-Buffering"] = "no"; // nginx: don't hold the stream back
        HttpContext.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();

        // Stop when the browser disconnects OR the API is shutting down.
        using var alive = CancellationTokenSource.CreateLinkedTokenSource(HttpContext.RequestAborted, lifetime.ApplicationStopping);
        var heartbeat = TimeSpan.FromSeconds(bus.HeartbeatSeconds);

        async Task Send(string text)
        {
            await Response.WriteAsync(text, alive.Token);
            await Response.Body.FlushAsync(alive.Token);
        }

        try
        {
            await Send("retry: 3000\nevent: ready\ndata: ok\n\n");

            while (!alive.IsCancellationRequested)
            {
                using var wait = CancellationTokenSource.CreateLinkedTokenSource(alive.Token);
                wait.CancelAfter(heartbeat);
                try
                {
                    var topic = await subscription.Reader.ReadAsync(wait.Token);
                    await Send($"event: change\ndata: {topic}\n\n");
                }
                catch (OperationCanceledException) when (!alive.IsCancellationRequested)
                {
                    await Send(": keep-alive\n\n"); // nothing happened for a while
                }
            }
        }
        catch (OperationCanceledException) { /* browser left, or the API is stopping */ }
        catch (ChannelClosedException) { }
    }
}
