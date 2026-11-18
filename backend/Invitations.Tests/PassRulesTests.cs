using Invitations.Api.Domain;

namespace Invitations.Tests;

public class PassRulesTests
{
    [Theory]
    [InlineData(0, 500, 500)]   // Borrador: usa el paquete más grande.
    [InlineData(250, 500, 250)] // Pagado: usa el límite de su paquete.
    public void EffectiveLimit_uses_paid_plan_or_largest_while_draft(int eventMax, int largest, int expected) =>
        Assert.Equal(expected, PassRules.EffectiveLimit(eventMax, largest));

    [Theory]
    [InlineData(100, 96, 0, 4, true)]    // Nueva invitación que llena justo el límite.
    [InlineData(100, 96, 0, 5, false)]   // Nueva invitación que se pasa por uno.
    [InlineData(100, 100, 10, 10, true)] // Editar sin cambiar pases con el evento lleno.
    [InlineData(100, 100, 10, 4, true)]  // Bajar pases siempre cabe.
    [InlineData(100, 100, 10, 11, false)]// Subir pases con el evento lleno.
    public void Fits_counts_previous_passes_of_the_edited_invitation(
        int limit, int total, int previous, int requested, bool expected) =>
        Assert.Equal(expected, PassRules.Fits(limit, total, previous, requested));
}

public class InvitationTokensTests
{
    [Fact]
    public void New_is_url_safe_and_22_chars()
    {
        var token = InvitationTokens.New();
        Assert.Equal(22, token.Length);
        Assert.Matches("^[A-Za-z0-9_-]+$", token);
    }

    [Fact]
    public void New_does_not_repeat()
    {
        var tokens = Enumerable.Range(0, 10_000).Select(_ => InvitationTokens.New()).ToHashSet();
        Assert.Equal(10_000, tokens.Count);
    }
}
