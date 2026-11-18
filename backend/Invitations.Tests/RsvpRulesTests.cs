using Invitations.Api.Domain;

namespace Invitations.Tests;

public class RsvpRulesTests
{
    private static readonly DateTimeOffset Now = new(2027, 3, 1, 12, 0, 0, TimeSpan.Zero);

    private static Event NewEvent(DateTimeOffset? deadline = null, EventStatus status = EventStatus.Published) => new()
    {
        Id = Guid.NewGuid(),
        StartsAt = Now.AddDays(30),
        RsvpDeadline = deadline,
        Status = status,
    };

    private static Invitation NewInvitation(int passes = 4) => new()
    {
        Id = Guid.NewGuid(),
        DisplayName = "Familia Pérez",
        Passes = passes,
    };

    [Fact]
    public void Can_respond_before_deadline() =>
        Assert.Null(RsvpRules.BlockedReason(NewEvent(deadline: Now.AddDays(1)), Now));

    [Fact]
    public void Cannot_respond_after_deadline() =>
        Assert.NotNull(RsvpRules.BlockedReason(NewEvent(deadline: Now.AddMinutes(-1)), Now));

    [Fact]
    public void Cannot_respond_once_event_started()
    {
        var ev = NewEvent();
        ev.StartsAt = Now.AddMinutes(-5);
        Assert.NotNull(RsvpRules.BlockedReason(ev, Now));
    }

    [Fact]
    public void Cannot_respond_to_archived_event() =>
        Assert.NotNull(RsvpRules.BlockedReason(NewEvent(status: EventStatus.Archived), Now));

    [Theory]
    [InlineData(true, 0, false)]
    [InlineData(true, 1, true)]
    [InlineData(true, 4, true)]
    [InlineData(true, 5, false)]
    [InlineData(false, 0, true)] // Declinar no exige número de lugares.
    public void Validate_checks_confirmed_passes_against_invitation(bool attending, int confirmed, bool valid) =>
        Assert.Equal(valid, RsvpRules.Validate(NewInvitation(4), attending, confirmed, null) is null);

    [Fact]
    public void Validate_rejects_more_names_than_confirmed_passes() =>
        Assert.NotNull(RsvpRules.Validate(NewInvitation(4), true, 2, ["Ana", "Luis", "Pepe"]));

    [Fact]
    public void Apply_confirmed_creates_guests_with_names_and_defaults()
    {
        var inv = NewInvitation(4);
        RsvpRules.Apply(inv, true, 3, ["Ana", "  ", "Luis"], "  ¡Ahí estaremos!  ", Now);

        Assert.Equal(RsvpStatus.Confirmed, inv.RsvpStatus);
        Assert.Equal(3, inv.ConfirmedPasses);
        Assert.Equal(Now, inv.RespondedAt);
        Assert.Equal("¡Ahí estaremos!", inv.Message);
        Assert.Equal(["Ana", "Familia Pérez (2)", "Luis"], inv.Guests.OrderBy(g => g.Id).Select(g => g.Name));
    }

    [Fact]
    public void Apply_keeps_existing_guests_when_reducing_and_preserves_their_tables()
    {
        var inv = NewInvitation(4);
        RsvpRules.Apply(inv, true, 3, ["Ana", "Luis", "Pepe"], null, Now);
        var table = Guid.NewGuid();
        var first = inv.Guests.OrderBy(g => g.Id).First();
        first.TableId = table;

        RsvpRules.Apply(inv, true, 2, ["Ana María", "Luis"], null, Now.AddHours(1));

        var guests = inv.Guests.OrderBy(g => g.Id).ToList();
        Assert.Equal(2, guests.Count);
        Assert.Same(first, guests[0]);
        Assert.Equal("Ana María", guests[0].Name);
        Assert.Equal(table, guests[0].TableId);
    }

    [Fact]
    public void Apply_growing_appends_new_guests_after_existing_ones()
    {
        var inv = NewInvitation(4);
        RsvpRules.Apply(inv, true, 1, ["Ana"], null, Now);
        RsvpRules.Apply(inv, true, 3, ["Ana", "Luis", "Pepe"], null, Now.AddHours(1));

        Assert.Equal(["Ana", "Luis", "Pepe"], inv.Guests.OrderBy(g => g.Id).Select(g => g.Name));
    }

    [Fact]
    public void Apply_without_names_keeps_names_already_given()
    {
        var inv = NewInvitation(4);
        RsvpRules.Apply(inv, true, 2, ["Carlos", "Ana"], null, Now);
        RsvpRules.Apply(inv, true, 3, null, null, Now.AddHours(1));

        Assert.Equal(["Carlos", "Ana", "Familia Pérez (3)"], inv.Guests.OrderBy(g => g.Id).Select(g => g.Name));
    }

    [Fact]
    public void Apply_declined_removes_guests_and_confirmed_passes()
    {
        var inv = NewInvitation(4);
        RsvpRules.Apply(inv, true, 2, null, null, Now);
        RsvpRules.Apply(inv, false, 0, null, null, Now.AddHours(1));

        Assert.Equal(RsvpStatus.Declined, inv.RsvpStatus);
        Assert.Equal(0, inv.ConfirmedPasses);
        Assert.Empty(inv.Guests);
    }

    [Fact]
    public void Message_is_truncated_to_max_length()
    {
        var inv = NewInvitation();
        RsvpRules.Apply(inv, true, 1, null, new string('x', RsvpRules.MaxMessageLength + 50), Now);
        Assert.Equal(RsvpRules.MaxMessageLength, inv.Message!.Length);
    }
}
