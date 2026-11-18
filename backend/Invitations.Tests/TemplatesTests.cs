using System.Text.Json;
using Invitations.Api.Domain;

namespace Invitations.Tests;

public class TemplatesTests
{
    private static JsonElement Json(string s) => JsonDocument.Parse(s).RootElement;

    [Theory]
    [InlineData(EventType.Wedding, "clasica")]
    [InlineData(EventType.Quinceanera, "jardin")]
    [InlineData(EventType.Other, "moderna")]
    public void DefaultFor_picks_template_by_event_type(EventType type, string expected) =>
        Assert.Equal(expected, Templates.DefaultFor(type));

    [Fact]
    public void Validate_accepts_known_key_and_object() =>
        Assert.Null(Templates.Validate("clasica", Json("""{"colors":{"primary":"#9b6b43"}}""")));

    [Fact]
    public void Validate_rejects_unknown_key() =>
        Assert.NotNull(Templates.Validate("inexistente", Json("{}")));

    [Theory]
    [InlineData("[]")]
    [InlineData("\"texto\"")]
    [InlineData("42")]
    public void Validate_rejects_non_object(string json) =>
        Assert.NotNull(Templates.Validate("clasica", Json(json)));

    [Fact]
    public void Validate_rejects_oversized_config()
    {
        var big = JsonSerializer.Serialize(new { text = new string('a', Templates.MaxConfigBytes) });
        Assert.NotNull(Templates.Validate("clasica", Json(big)));
    }

    [Theory]
    [InlineData("")]
    [InlineData("{}")]
    public void Parse_returns_empty_object_for_empty_config(string stored) =>
        Assert.Equal(JsonValueKind.Object, Templates.Parse(stored).ValueKind);
}
