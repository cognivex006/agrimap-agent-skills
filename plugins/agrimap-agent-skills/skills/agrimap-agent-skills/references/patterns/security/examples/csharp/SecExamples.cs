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

        return failures == 0 ? 0 : 1;
    }
}
