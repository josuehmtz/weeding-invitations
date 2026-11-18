using Invitations.Api.Domain;

namespace Invitations.Tests;

public class StaffRulesTests
{
    private static readonly DateTimeOffset Now = new(2027, 6, 12, 18, 0, 0, TimeSpan.Zero);

    private static StaffAccess NewAccess() => new() { Id = Guid.NewGuid(), ExpiresAt = Now.AddDays(1) };

    [Fact]
    public void NewPin_is_six_digits()
    {
        for (var i = 0; i < 200; i++)
            Assert.Matches("^[0-9]{6}$", StaffRules.NewPin());
    }

    [Fact]
    public void Access_expires_one_day_after_event_starts() =>
        Assert.Equal(Now.AddDays(1), StaffRules.ExpirationFor(new Event { StartsAt = Now }));

    [Fact]
    public void Expired_access_cannot_login()
    {
        var access = NewAccess();
        access.ExpiresAt = Now.AddMinutes(-1);
        Assert.Equal(StaffRules.LoginBlock.Expired, StaffRules.CheckCanLogin(access, Now));
    }

    [Fact]
    public void Locks_after_max_failed_attempts_and_unlocks_after_duration()
    {
        var access = NewAccess();
        for (var i = 0; i < StaffRules.MaxFailedAttempts - 1; i++)
            StaffRules.RegisterFailure(access, Now);
        Assert.Equal(StaffRules.LoginBlock.None, StaffRules.CheckCanLogin(access, Now));

        StaffRules.RegisterFailure(access, Now);
        Assert.Equal(StaffRules.LoginBlock.Locked, StaffRules.CheckCanLogin(access, Now));
        Assert.Equal(StaffRules.LoginBlock.None, StaffRules.CheckCanLogin(access, Now + StaffRules.LockoutDuration));
    }

    [Fact]
    public void Failure_after_lockout_ended_starts_counting_again()
    {
        var access = NewAccess();
        for (var i = 0; i < StaffRules.MaxFailedAttempts; i++)
            StaffRules.RegisterFailure(access, Now);

        StaffRules.RegisterFailure(access, Now + StaffRules.LockoutDuration + TimeSpan.FromSeconds(1));
        Assert.Equal(1, access.FailedAttempts);
        Assert.Null(access.LockedUntil);
    }

    [Fact]
    public void Success_resets_failures()
    {
        var access = NewAccess();
        StaffRules.RegisterFailure(access, Now);
        StaffRules.RegisterSuccess(access);
        Assert.Equal(0, access.FailedAttempts);
    }
}

public class CheckInRulesTests
{
    private static Invitation NewInvitation(int passes, RsvpStatus status = RsvpStatus.Confirmed, int confirmed = 0, params int[] checkIns)
    {
        var inv = new Invitation { Id = Guid.NewGuid(), Passes = passes, RsvpStatus = status, ConfirmedPasses = confirmed };
        foreach (var c in checkIns) inv.CheckIns.Add(new CheckIn { Id = Guid.NewGuid(), Count = c });
        return inv;
    }

    [Fact]
    public void Remaining_subtracts_previous_check_ins() =>
        Assert.Equal(1, CheckInRules.Remaining(NewInvitation(4, RsvpStatus.Confirmed, 4, 2, 1)));

    [Theory]
    [InlineData(0, false)]
    [InlineData(1, true)]
    [InlineData(2, true)]
    [InlineData(3, false)]
    public void Validate_allows_up_to_remaining_passes(int count, bool valid) =>
        Assert.Equal(valid, CheckInRules.Validate(NewInvitation(4, RsvpStatus.Confirmed, 4, 2), count) is null);

    [Fact]
    public void Validate_rejects_when_all_passes_used() =>
        Assert.Contains("Ya entraron", CheckInRules.Validate(NewInvitation(2, RsvpStatus.Confirmed, 2, 2), 1));

    [Fact]
    public void Warns_when_not_confirmed_or_declined()
    {
        Assert.Contains(CheckInRules.Warnings(NewInvitation(3, RsvpStatus.Pending)), w => w.Contains("no confirmó"));
        Assert.Contains(CheckInRules.Warnings(NewInvitation(3, RsvpStatus.Declined)), w => w.Contains("no asistiría"));
    }

    [Fact]
    public void Warns_when_confirmed_passes_already_in()
    {
        Assert.Empty(CheckInRules.Warnings(NewInvitation(4, RsvpStatus.Confirmed, 2, 1)));
        Assert.NotEmpty(CheckInRules.Warnings(NewInvitation(4, RsvpStatus.Confirmed, 2, 2)));
    }

    [Theory]
    [InlineData("https://misinvitaciones.mx/i/Py27Qce-B-I-N7ix8WFUNQ", "Py27Qce-B-I-N7ix8WFUNQ")]
    [InlineData("http://localhost:5173/i/QMR53ovt3q6Z29KE_gUcPw", "QMR53ovt3q6Z29KE_gUcPw")]
    [InlineData("  QMR53ovt3q6Z29KE_gUcPw ", "QMR53ovt3q6Z29KE_gUcPw")]
    [InlineData("https://otro-sitio.com/promo/abc", null)]
    [InlineData("hola", null)]
    [InlineData("", null)]
    public void TokenFromQr_extracts_token_from_invitation_link(string content, string? expected) =>
        Assert.Equal(expected, CheckInRules.TokenFromQr(content));
}
