using DepVault.Cli.Common;

namespace DepVault.Cli.Tests.Common;

public class LineDiffTests
{
    [Fact]
    public void Equal_Text_Has_No_Hunks()
    {
        Assert.Empty(LineDiff.Unified(["a", "b"], ["a", "b"]));
    }

    [Fact]
    public void Changed_Line_Shows_Removal_Then_Addition_With_Context()
    {
        var diff = LineDiff.Unified(["A=1", "B=2", "C=3"], ["A=1", "B=9", "C=3"]);

        Assert.Equal(["@@ -1,3 +1,3 @@", " A=1", "-B=2", "+B=9", " C=3"], diff);
    }

    [Fact]
    public void Distant_Changes_Get_Separate_Hunks()
    {
        var oldLines = Enumerable.Range(1, 20).Select(i => $"L{i}").ToArray();
        var newLines = oldLines.Select(l => l is "L2" or "L19" ? l + "x" : l).ToArray();

        var headers = LineDiff.Unified(oldLines, newLines).Where(l => l.StartsWith("@@")).ToList();

        Assert.Equal(["@@ -1,5 +1,5 @@", "@@ -16,5 +16,5 @@"], headers);
    }

    [Fact]
    public void SplitLines_Treats_Crlf_Like_Lf_And_Drops_Only_The_Final_Newline()
    {
        Assert.Equal(["a", "b", ""], LineDiff.SplitLines("a\r\nb\n\n"));
        Assert.Empty(LineDiff.SplitLines(""));
    }
}
