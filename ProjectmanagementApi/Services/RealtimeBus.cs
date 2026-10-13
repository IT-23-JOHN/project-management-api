using System.Collections.Concurrent;
using System.Threading.Channels;

namespace ProjectmanagementApi.Services;

/// <summary>
/// Tells every connected browser "something changed" so it can refresh what is on screen.
///
/// Only a topic NAME travels (projects, tasks, users, admin). No project data is ever sent over the stream:
/// browsers then re-read what they need through the normal API, which checks permissions as usual.
///
/// Settings (all optional, section "Realtime"):
///   MaxStreamsPerIp   default 100 - live connections allowed from one IP address (each open browser tab is one;
///                     generous on purpose, because everyone in an office or school shares one public IP)
///   HeartbeatSeconds  default 20 - keep-alive interval (stops proxies and browsers closing an idle stream)
/// </summary>
public sealed class RealtimeBus
{
    private sealed record Subscriber(string Key, Channel<string> Channel);

    private readonly ConcurrentDictionary<Guid, Subscriber> _subscribers = new();
    private readonly int _maxPerKey;

    public RealtimeBus(IConfiguration config)
    {
        _maxPerKey = Math.Max(1, config.GetValue("Realtime:MaxStreamsPerIp", 100));
        HeartbeatSeconds = Math.Max(1, config.GetValue("Realtime:HeartbeatSeconds", 20));
    }

    public int HeartbeatSeconds { get; }

    /// <summary>Number of open live connections.</summary>
    public int Count => _subscribers.Count;

    /// <summary>Starts listening. Returns null when this key (IP address) already has too many connections open.</summary>
    public Subscription? Subscribe(string key)
    {
        if (_subscribers.Values.Count(s => s.Key == key) >= _maxPerKey) return null;

        // Small buffer; if a slow browser falls behind, the oldest pings are dropped (they all mean the same thing).
        var channel = Channel.CreateBounded<string>(new BoundedChannelOptions(32)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true
        });
        var id = Guid.NewGuid();
        _subscribers[id] = new Subscriber(key, channel);

        return new Subscription(channel.Reader, () =>
        {
            _subscribers.TryRemove(id, out _);
            channel.Writer.TryComplete();
        });
    }

    /// <summary>Tells everyone that a topic changed.</summary>
    public void Publish(string topic)
    {
        foreach (var subscriber in _subscribers.Values)
            subscriber.Channel.Writer.TryWrite(topic);
    }
}

/// <summary>One open live connection. Dispose it when the connection ends.</summary>
public sealed class Subscription : IDisposable
{
    private readonly Action _onDispose;
    public Subscription(ChannelReader<string> reader, Action onDispose) { Reader = reader; _onDispose = onDispose; }
    public ChannelReader<string> Reader { get; }
    public void Dispose() => _onDispose();
}
