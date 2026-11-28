# Calling role-protected endpoints from tests

Reference for the `dotnet-testing` skill. Use it only when an endpoint under test requires authorisation. If the test project already has a way to sign in as a role, use that and ignore this file.

The handler below replaces the real sign-in scheme inside the test host. A request is signed in as the role named in the `X-Test-Role` header; a request without the header is anonymous. It lives in the test project only, never in `src/`.

```csharp
public sealed class TestAuthHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string Scheme = "Test";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue("X-Test-Role", out var role))
            return Task.FromResult(AuthenticateResult.NoResult());

        var identity = new ClaimsIdentity([new Claim(ClaimTypes.Role, role.ToString())], Scheme);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
```

Register it in the factory:

```csharp
builder.ConfigureTestServices(services =>
    services.AddAuthentication(TestAuthHandler.Scheme)
        .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.Scheme, _ => { }));
```

Use it in a test:

```csharp
var client = factory.CreateClient();
client.DefaultRequestHeaders.Add("X-Test-Role", "Librarian");
```

Rules:

- Tests for an AC call the endpoint as the role an AC names, or the role the endpoint already requires.
- Write a 401 test (no header) or a 403 test (a different role) only when an AC names that outcome.
- If the app has no authentication set up, do not add this handler or any authentication; note it in the end report.
- If a policy needs a claim other than role, add that claim here only when an AC depends on it.
