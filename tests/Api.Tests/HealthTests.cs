using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Api.Tests;

public sealed class HealthTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    [Trait("AC", "T-1/AC1")]
    public async Task Getting_health_returns_200_with_status_healthy()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("""{"status":"Healthy"}""", await response.Content.ReadAsStringAsync());
    }
}
