namespace Api.Tests;

public sealed class SolutionTests
{
    [Fact]
    [Trait("AC", "T-1/AC2")]
    public void The_root_solution_lists_the_api_project_and_the_test_project()
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root is not null && root.GetFiles("*.slnx").Length == 0) root = root.Parent;
        Assert.NotNull(root);

        var solution = File.ReadAllText(Assert.Single(root.GetFiles("*.slnx")).FullName);

        Assert.Contains("src/Api/Api.csproj", solution);
        Assert.Contains("tests/Api.Tests/Api.Tests.csproj", solution);
    }
}
