using Invitations.Api.Domain;

namespace Invitations.Tests;

public class SeatingRulesTests
{
    private static TableInput Table(int number, int capacity = 10, Guid? id = null) =>
        new(id, number, null, TableShape.Round, capacity, 100, 100, 0);

    private static readonly Dictionary<Guid, int> NoneSeated = [];

    [Fact]
    public void Valid_tables_pass() =>
        Assert.Null(SeatingRules.ValidateTables([Table(1), Table(2), Table(3, 8)], NoneSeated));

    [Fact]
    public void Duplicated_numbers_are_rejected() =>
        Assert.Contains("número 2", SeatingRules.ValidateTables([Table(1), Table(2), Table(2)], NoneSeated));

    [Theory]
    [InlineData(0)]
    [InlineData(31)]
    public void Capacity_out_of_range_is_rejected(int capacity) =>
        Assert.NotNull(SeatingRules.ValidateTables([Table(1, capacity)], NoneSeated));

    [Fact]
    public void Cannot_reduce_capacity_below_seated_guests()
    {
        var id = Guid.NewGuid();
        var seated = new Dictionary<Guid, int> { [id] = 8 };
        Assert.Contains("8 invitados sentados", SeatingRules.ValidateTables([Table(1, 6, id)], seated));
        Assert.Null(SeatingRules.ValidateTables([Table(1, 8, id)], seated));
    }

    [Fact]
    public void Swapping_numbers_is_valid() =>
        Assert.Null(SeatingRules.ValidateTables([Table(2, id: Guid.NewGuid()), Table(1, id: Guid.NewGuid())], NoneSeated));

    [Fact]
    public void Layout_rejects_unknown_elements_and_bad_sizes()
    {
        Assert.Null(SeatingRules.ValidateLayout(SeatingLayout.Default));
        Assert.NotNull(SeatingRules.ValidateLayout(SeatingLayout.Default with { Width = 50 }));
        Assert.NotNull(SeatingRules.ValidateLayout(SeatingLayout.Default with
        {
            Elements = [new LayoutElement("a", "alberca", "Alberca", 0, 0, 100, 100, 0)],
        }));
    }

    private static readonly Guid T1 = Guid.NewGuid(), T2 = Guid.NewGuid();
    private static readonly Dictionary<Guid, (int Number, int Capacity)> Tables = new()
    {
        [T1] = (1, 2),
        [T2] = (2, 10),
    };

    [Fact]
    public void Assignments_respect_capacity()
    {
        var (a, b, c) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var current = new Dictionary<Guid, Guid?> { [a] = T1, [b] = null, [c] = null };

        var (ok, error) = SeatingRules.ApplyAssignments(current, [(b, T1)], Tables);
        Assert.Null(error);
        Assert.Equal(T1, ok[b]);

        var (_, full) = SeatingRules.ApplyAssignments(current, [(b, T1), (c, T1)], Tables);
        Assert.Contains("mesa 1 solo tiene 2", full);
    }

    [Fact]
    public void Moving_out_frees_a_seat_in_the_same_request()
    {
        var (a, b, c) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var current = new Dictionary<Guid, Guid?> { [a] = T1, [b] = T1, [c] = null };
        var (result, error) = SeatingRules.ApplyAssignments(current, [(a, T2), (c, T1)], Tables);
        Assert.Null(error);
        Assert.Equal(T2, result[a]);
        Assert.Equal(T1, result[c]);
    }

    [Fact]
    public void Unassigning_is_allowed()
    {
        var a = Guid.NewGuid();
        var (result, error) = SeatingRules.ApplyAssignments(new Dictionary<Guid, Guid?> { [a] = T1 }, [(a, null)], Tables);
        Assert.Null(error);
        Assert.Null(result[a]);
    }

    [Fact]
    public void Foreign_guest_or_table_is_rejected()
    {
        var a = Guid.NewGuid();
        var current = new Dictionary<Guid, Guid?> { [a] = null };
        Assert.NotNull(SeatingRules.ApplyAssignments(current, [(Guid.NewGuid(), T1)], Tables).Error);
        Assert.NotNull(SeatingRules.ApplyAssignments(current, [(a, Guid.NewGuid())], Tables).Error);
    }
}
