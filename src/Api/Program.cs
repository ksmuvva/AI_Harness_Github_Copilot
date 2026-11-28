var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/health", () => TypedResults.Ok(new HealthResponse("Healthy")));

app.Run();

public sealed record HealthResponse(string Status);

// Lets the test project start the API in memory.
public partial class Program;
