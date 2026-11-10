// Tested BAD/GOOD security examples for C# (6.3.0).
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

        return failures == 0 ? 0 : 1;
    }
}
