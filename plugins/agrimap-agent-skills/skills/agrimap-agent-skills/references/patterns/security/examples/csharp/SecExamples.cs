// Tested BAD/GOOD security examples for C# (6.3.0; SEC-01/15 6.4.2).
// Run by tests/unit/security-examples.test.mjs (dotnet run on a copy); exits 1 on
// the first failed check. BAD shapes are the surface file's "Do not write",
// GOOD shapes its "Write it this way".
using System.Text;

static class Sec04PathTraversal
{
    public static string Bad(string root, string name) => Path.Combine(root, name);

    public static string Good(string root, string name)
    {
        var baseDir = Path.GetFullPath(root);
        var full = Path.GetFullPath(Path.Combine(baseDir, name));
        if (!full.StartsWith(baseDir + Path.DirectorySeparatorChar, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("PATH_OUTSIDE_ROOT");
        }
        return full;
    }
}

static class Sec03LdapFilter
{
    public static string Bad(string value) => $"(uid={value})";

    // RFC 4515 escaping of each value; the template stays constant.
    public static string Good(string value) => $"(uid={Escape(value)})";

    private static string Escape(string value)
    {
        var sb = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            sb.Append(ch switch
            {
                '\\' => @"\5c",
                '*' => @"\2a",
                '(' => @"\28",
                ')' => @"\29",
                '\0' => @"\00",
                _ => ch.ToString(),
            });
        }
        return sb.ToString();
    }
}

static class Sec01SqlInjection
{
    public sealed record Command(string Text, IReadOnlyDictionary<string, object> Parameters);

    public static Command Bad(string name) =>
        new($"SELECT Id FROM dbo.Farm WHERE Name = '{name}'", new Dictionary<string, object>());

    // Constant command text (stored procedure through Infrastructure); the value is a parameter.
    public static Command Good(string name) =>
        new("dbo.Farm_Q", new Dictionary<string, object> { ["@Name"] = name });
}

static class Sec15OpenRedirect
{
    public static string Bad(string returnUrl) => returnUrl;

    // Same rule as Url.IsLocalUrl: "/path" or "~/path", never "//host" or "/\host".
    public static string Good(string returnUrl, IReadOnlySet<string> allowedHosts)
    {
        if (IsLocalUrl(returnUrl)) return returnUrl;
        if (Uri.TryCreate(returnUrl, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps && allowedHosts.Contains(uri.Host)) return uri.ToString();
        return "/";
    }

    private static bool IsLocalUrl(string url) =>
        (url.Length > 0 && url[0] == '/' && (url.Length == 1 || (url[1] != '/' && url[1] != '\\')))
        || (url.Length > 1 && url[0] == '~' && url[1] == '/');
}

static class Sec02CommandInjection
{
    public static System.Diagnostics.ProcessStartInfo Bad(string file) =>
        new("cmd", "/c type " + file); // `a.txt & del *` runs a second command

    // Fixed executable; each value is one argument, never parsed by a shell.
    public static System.Diagnostics.ProcessStartInfo Good(string file)
    {
        var info = new System.Diagnostics.ProcessStartInfo("/usr/bin/tool") { UseShellExecute = false };
        info.ArgumentList.Add("--input");
        info.ArgumentList.Add(file);
        return info;
    }
}

static class Sec10TokenKey
{
    public const string BadKey = "agrimap-secret"; // in source, 112 bits

    // Key from configuration, at least 32 bytes for HS256.
    public static byte[] Good(string? configured)
    {
        if (string.IsNullOrEmpty(configured)) throw new InvalidOperationException("JWT_KEY_MISSING");
        var key = Encoding.UTF8.GetBytes(configured);
        if (key.Length < 32) throw new InvalidOperationException("JWT_KEY_TOO_SHORT");
        return key;
    }
}

static class Sec12Deserialization
{
    public sealed record FarmDto(int Id, string Name);

    // Type chosen by the payload (the TypeNameHandling.All / BinaryFormatter shape).
    public static object? Bad(string typeName, string json) =>
        Type.GetType(typeName) is { } type ? System.Text.Json.JsonSerializer.Deserialize(json, type) : null;

    // Declared type: a "$type" field in the payload is ignored.
    public static FarmDto? Good(string json) => System.Text.Json.JsonSerializer.Deserialize<FarmDto>(json);
}

static class Sec13Cors
{
    public static bool Bad(string origin) => true; // SetIsOriginAllowed(_ => true)

    // Exact origins per environment from configuration.
    public static bool Good(string origin, IReadOnlySet<string> configuredOrigins) => configuredOrigins.Contains(origin);
}

static class Sec18UnboundedInput
{
    public const int MaxPageSize = 100;

    public static int Bad(int pageSize) => pageSize; // 1_000_000 rows in one request

    // [Range(1, MaxPageSize)] equivalent: reject outside the largest legitimate use.
    public static int Good(int pageSize) =>
        pageSize is >= 1 and <= MaxPageSize ? pageSize : throw new ArgumentOutOfRangeException(nameof(pageSize), "PAGE_SIZE_OUT_OF_RANGE");

    // [RequestSizeLimit] equivalent for a body read.
    public static byte[] ReadBounded(Stream body, int maxBytes)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[8192];
        int read;
        while ((read = body.Read(chunk, 0, chunk.Length)) > 0)
        {
            if (buffer.Length + read > maxBytes) throw new InvalidOperationException("BODY_TOO_LARGE");
            buffer.Write(chunk, 0, read);
        }
        return buffer.ToArray();
    }
}

static class Sec06ErrorDetail
{
    public sealed class AppException(string code) : Exception(code) { public string Code { get; } = code; }
    public sealed record ErrorBody(string Code, string Message);

    public static ErrorBody Bad(Exception ex) => new("ERROR", ex.Message + " " + ex.StackTrace); // internals to the caller

    // AppException code with the configured message; anything else is a generic code.
    public static ErrorBody Good(Exception ex, IReadOnlyDictionary<string, string> messages) =>
        ex is AppException app && messages.TryGetValue(app.Code, out var text)
            ? new(app.Code, text)
            : new("SYSTEM_ERROR", messages["SYSTEM_ERROR"]);
}

static class Sec17ResponseField
{
    public sealed record UserEntity(int Id, string Name, string Email, string PasswordHash, string Salt);
    public sealed record UserListItem(int Id, string Name);

    public static UserEntity Bad(UserEntity user) => user; // PasswordHash and Salt serialized

    // Response DTO with only what the list needs.
    public static UserListItem Good(UserEntity user) => new(user.Id, user.Name);
}

static class Sec28CommittedSecret
{
    public const string BadConnectionString = "Server=db;User Id=sa;Password=P@ssw0rd!"; // in source and history

    // From the environment or a secret store; fail fast when missing.
    public static string Good(Func<string, string?> env) =>
        env("ConnectionStrings__Main") is { Length: > 0 } value ? value : throw new InvalidOperationException("CONNECTION_STRING_MISSING");
}

static class Sec31ForwardedHeaders
{
    // Empty KnownProxies/KnownNetworks: every peer may set X-Forwarded-For.
    public static string Bad(string peerIp, string? forwardedFor) => forwardedFor ?? peerIp;

    // Client IP from the header only when the peer is a configured proxy.
    public static string Good(string peerIp, string? forwardedFor, IReadOnlySet<string> knownProxies) =>
        knownProxies.Contains(peerIp) && !string.IsNullOrWhiteSpace(forwardedFor)
            ? forwardedFor.Split(',')[^1].Trim()
            : peerIp;
}

static class Program
{
    private static int failures;

    private static void Check(bool ok, string name)
    {
        Console.WriteLine($"{(ok ? "ok" : "FAIL")} {name}");
        if (!ok) failures++;
    }

    private static int Main()
    {
        var root = Path.Combine(Path.GetTempPath(), "agm-sec-root");
        var escaped = Path.GetFullPath(Sec04PathTraversal.Bad(root, "../secret.txt"));
        Check(!escaped.StartsWith(Path.GetFullPath(root), StringComparison.Ordinal), "SEC-04 bad escapes root");
        Check(Sec04PathTraversal.Good(root, "a/b.txt").EndsWith(Path.Combine("a", "b.txt"), StringComparison.Ordinal), "SEC-04 good keeps a valid name");
        var threw = false;
        try { Sec04PathTraversal.Good(root, "../secret.txt"); } catch (InvalidOperationException) { threw = true; }
        Check(threw, "SEC-04 good rejects traversal");

        const string attack = "*)(uid=*";
        Check(Sec03LdapFilter.Bad(attack) == "(uid=*)(uid=*)", "SEC-03 bad lets the value change the filter");
        Check(Sec03LdapFilter.Good(attack) == @"(uid=\2a\29\28uid=\2a)", "SEC-03 good escapes filter metacharacters");
        Check(Sec03LdapFilter.Good("o'brien") == "(uid=o'brien)", "SEC-03 good keeps a valid name unchanged");

        const string sqlAttack = "x' OR '1'='1";
        Check(Sec01SqlInjection.Bad(sqlAttack).Text.Contains("OR '1'='1'"), "SEC-01 bad puts the value into the SQL text");
        var cmd = Sec01SqlInjection.Good(sqlAttack);
        Check(cmd.Text == "dbo.Farm_Q" && (string)cmd.Parameters["@Name"] == sqlAttack, "SEC-01 good keeps constant text and passes the value as a parameter");

        var hosts = new HashSet<string> { "login.agrimap.example" };
        Check(Sec15OpenRedirect.Bad("//evil.example") == "//evil.example", "SEC-15 bad returns an external target");
        Check(Sec15OpenRedirect.Good("//evil.example", hosts) == "/" && Sec15OpenRedirect.Good("/\\evil.example", hosts) == "/" && Sec15OpenRedirect.Good("https://evil.example/", hosts) == "/", "SEC-15 good rejects external targets");
        Check(Sec15OpenRedirect.Good("/farms/1?tab=a", hosts) == "/farms/1?tab=a" && Sec15OpenRedirect.Good("https://login.agrimap.example/cb", hosts) == "https://login.agrimap.example/cb", "SEC-15 good keeps local paths and allow-listed hosts");

        const string cmdAttack = "a.txt & del *";
        Check(Sec02CommandInjection.Bad(cmdAttack).Arguments.Contains("& del *"), "SEC-02 bad hands the value to a shell");
        var proc = Sec02CommandInjection.Good(cmdAttack);
        Check(proc.ArgumentList.Count == 2 && proc.ArgumentList[1] == cmdAttack && !proc.UseShellExecute, "SEC-02 good passes the value as one argument without a shell");

        Check(Encoding.UTF8.GetByteCount(Sec10TokenKey.BadKey) < 32, "SEC-10 bad key is shorter than 256 bits");
        var keyThrew = false;
        try { Sec10TokenKey.Good(Sec10TokenKey.BadKey); } catch (InvalidOperationException) { keyThrew = true; }
        Check(keyThrew && Sec10TokenKey.Good(new string('k', 32)).Length == 32, "SEC-10 good rejects a short key and accepts 32 bytes");

        var gadget = Sec12Deserialization.Bad("System.Collections.Generic.List`1[[System.String]]", "[\"x\"]");
        Check(gadget is List<string>, "SEC-12 bad lets the payload pick the type");
        var dto = Sec12Deserialization.Good("{\"$type\":\"System.IO.FileInfo\",\"Id\":7,\"Name\":\"A\"}");
        Check(dto == new Sec12Deserialization.FarmDto(7, "A"), "SEC-12 good binds only the declared type");

        var origins = new HashSet<string> { "https://app.agrimap.example" };
        Check(Sec13Cors.Bad("https://evil.example"), "SEC-13 bad allows any origin");
        Check(Sec13Cors.Good("https://app.agrimap.example", origins) && !Sec13Cors.Good("https://evil.example", origins) && !Sec13Cors.Good("https://app.agrimap.example.evil.example", origins), "SEC-13 good allows only configured origins");

        Check(Sec18UnboundedInput.Bad(1_000_000) == 1_000_000, "SEC-18 bad accepts any page size");
        var sizeThrew = false;
        try { Sec18UnboundedInput.Good(1_000_000); } catch (ArgumentOutOfRangeException) { sizeThrew = true; }
        Check(sizeThrew && Sec18UnboundedInput.Good(50) == 50, "SEC-18 good rejects oversized pages and keeps valid ones");
        var bodyThrew = false;
        try { Sec18UnboundedInput.ReadBounded(new MemoryStream(new byte[20_000]), 10_000); } catch (InvalidOperationException) { bodyThrew = true; }
        Check(bodyThrew && Sec18UnboundedInput.ReadBounded(new MemoryStream(new byte[5_000]), 10_000).Length == 5_000, "SEC-18 good bounds the body read");

        var messages = new Dictionary<string, string> { ["FARM_NOT_FOUND"] = "ไม่พบข้อมูลแปลง", ["SYSTEM_ERROR"] = "ระบบขัดข้อง" };
        var dbError = new InvalidOperationException("Login failed for user 'sa' on server db01");
        Check(Sec06ErrorDetail.Bad(dbError).Message.Contains("db01"), "SEC-06 bad returns exception detail");
        Check(Sec06ErrorDetail.Good(dbError, messages) == new Sec06ErrorDetail.ErrorBody("SYSTEM_ERROR", "ระบบขัดข้อง") && Sec06ErrorDetail.Good(new Sec06ErrorDetail.AppException("FARM_NOT_FOUND"), messages).Message == "ไม่พบข้อมูลแปลง", "SEC-06 good returns only the code and configured message");

        var user = new Sec17ResponseField.UserEntity(1, "Somchai", "s@example.th", "hash", "salt");
        Check(System.Text.Json.JsonSerializer.Serialize(Sec17ResponseField.Bad(user)).Contains("PasswordHash"), "SEC-17 bad serializes the password hash");
        var item = System.Text.Json.JsonSerializer.Serialize(Sec17ResponseField.Good(user));
        Check(!item.Contains("PasswordHash") && !item.Contains("Salt") && !item.Contains("s@example.th") && item.Contains("Somchai"), "SEC-17 good returns only the listed fields");

        Check(Sec28CommittedSecret.BadConnectionString.Contains("Password="), "SEC-28 bad keeps the password in source");
        var missing = false;
        try { Sec28CommittedSecret.Good(_ => null); } catch (InvalidOperationException) { missing = true; }
        Check(missing && Sec28CommittedSecret.Good(k => k == "ConnectionStrings__Main" ? "from-env" : null) == "from-env", "SEC-28 good reads the environment and fails when missing");

        var proxies = new HashSet<string> { "10.0.0.5" };
        Check(Sec31ForwardedHeaders.Bad("203.0.113.9", "127.0.0.1") == "127.0.0.1", "SEC-31 bad trusts a spoofed header from any peer");
        Check(Sec31ForwardedHeaders.Good("203.0.113.9", "127.0.0.1", proxies) == "203.0.113.9" && Sec31ForwardedHeaders.Good("10.0.0.5", "1.2.3.4, 198.51.100.7", proxies) == "198.51.100.7", "SEC-31 good uses the header only from a known proxy");

        return failures == 0 ? 0 : 1;
    }
}
