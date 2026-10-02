namespace DotnetApi.DTOs;

public class PaginationDto
{
    public int? Page { get; set; } = 1;
    public int? Limit { get; set; } = 10;
}

public class FilterConditionDto
{
    public string? Field { get; set; }
    public string? Operator { get; set; } = "eq";
    public object? Value { get; set; }
}

public class FilterGroupDto
{
    public string? Logic { get; set; } = "AND";
    public List<FilterConditionDto> Conditions { get; set; } = new();
}

public class SortItemDto
{
    public string? Field { get; set; }
    public string? Order { get; set; } = "desc";
}

public class GroupByDto
{
    public string? Field { get; set; }
    public string? LabelField { get; set; }
    public List<string>? MetaFields { get; set; }
}

public class SearchRequest
{
    public PaginationDto? Pagination { get; set; }
    public FilterGroupDto? Filter { get; set; }
    public List<SortItemDto>? Sort { get; set; }
    public GroupByDto? GroupBy { get; set; }
}
