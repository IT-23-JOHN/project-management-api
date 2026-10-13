using System.Net;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;

namespace ProjectmanagementApi.Services;

/// <summary>
/// Per-IP limits for the sign-in endpoints. (The per-email limit lives in AuthController.)
///
/// These stop one computer from trying many different email addresses, or guessing many codes.
/// Counters are kept in memory, so they reset when the API restarts and are not shared between servers.
///
/// Settings (all optional, section "RateLimiting"):
///   OtpRequestsPerHourPerIp         default 30   - "email me a code" requests
///   OtpVerifyAttemptsPer15MinPerIp  default 60   - code entry attempts
///                                   (generous on purpose: people in one office or school share a single public IP)
///   BehindProxy                     default false - set true ONLY if the API runs behind a reverse proxy
///                                                   (nginx, IIS, a load balancer). Then the visitor's real IP is read
///                                                   from X-Forwarded-For. Left false, that header is ignored so it can't be faked.
///   TrustedProxies                  default []   - IP addresses of your proxy servers (loopback is always trusted)
/// </summary>
public static class AuthRateLimiting
{
    public const string OtpRequest = "otp-request";
    public const string OtpVerify = "otp-verify";

    private static readonly TimeSpan RequestWindow = TimeSpan.FromHours(1);
    private static readonly TimeSpan VerifyWindow = TimeSpan.FromMinutes(15);

    public static IServiceCollection AddAuthRateLimiting(this IServiceCollection services, IConfiguration config)
    {
        var requestsPerHour = Math.Max(1, config.GetValue("RateLimiting:OtpRequestsPerHourPerIp", 30));
        var verifyPer15Min = Math.Max(1, config.GetValue("RateLimiting:OtpVerifyAttemptsPer15MinPerIp", 60));

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            options.AddPolicy(OtpRequest, http => PerIp(http, requestsPerHour, RequestWindow));
            options.AddPolicy(OtpVerify, http => PerIp(http, verifyPer15Min, VerifyWindow));

            options.OnRejected = async (context, cancellationToken) =>
            {
                var http = context.HttpContext;

                // A sliding window can't say exactly when the next attempt will be allowed,
                // so we report the longest possible wait: the length of the window.
                var policy = http.GetEndpoint()?.Metadata.GetMetadata<EnableRateLimitingAttribute>()?.PolicyName;
                var window = policy == OtpVerify ? VerifyWindow : RequestWindow;
                var seconds = (int)window.TotalSeconds;
                var windowText = window.TotalMinutes >= 60 ? "an hour" : $"{(int)window.TotalMinutes} minutes";

                http.Response.Headers.RetryAfter = seconds.ToString();
                http.RequestServices.GetService<ILoggerFactory>()?
                    .CreateLogger("AuthRateLimiting")
                    .LogWarning("Rate limit reached on {Path} from {Ip}", http.Request.Path, ClientIp(http));

                await http.Response.WriteAsJsonAsync(new
                {
                    error = "rate_limited",
                    message = $"Too many attempts from your network. Please try again later (this limit resets within {windowText}).",
                    retryAfterSeconds = seconds
                }, cancellationToken);
            };
        });

        if (config.GetValue<bool>("RateLimiting:BehindProxy"))
        {
            services.Configure<ForwardedHeadersOptions>(options =>
            {
                options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
                foreach (var proxy in config.GetSection("RateLimiting:TrustedProxies").Get<string[]>() ?? Array.Empty<string>())
                    if (IPAddress.TryParse(proxy, out var address)) options.KnownProxies.Add(address);
            });
        }

        return services;
    }

    /// <summary>The caller's IP address (after forwarded headers are applied, when enabled).</summary>
    public static string ClientIp(HttpContext http)
    {
        var ip = http.Connection.RemoteIpAddress;
        if (ip is null) return "unknown";
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        return ip.ToString();
    }

    // A sliding window is smoother than a fixed one: it can't be doubled by sending a burst on each side of a reset.
    private static RateLimitPartition<string> PerIp(HttpContext http, int permits, TimeSpan window) =>
        RateLimitPartition.GetSlidingWindowLimiter(ClientIp(http), _ => new SlidingWindowRateLimiterOptions
        {
            PermitLimit = permits,
            Window = window,
            SegmentsPerWindow = 6,
            QueueLimit = 0,
            AutoReplenishment = true
        });
}
