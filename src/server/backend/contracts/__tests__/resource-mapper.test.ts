import { describe, expect, it } from "vitest";

import { mapResource, mapResourceList } from "@/server/backend/contracts/resource-mapper";
import type { ListResourcesResponseDto, ResourceDto } from "@/server/backend/contracts/maintmode-dto";

describe("mapResource", () => {
  it("carries through a fully populated resource", () => {
    const dto: ResourceDto = {
      id: "r-1",
      name: "orders-db",
      description: "Primary orders database",
      external_id: "svc-42",
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-02-01T00:00:00Z",
    };
    expect(mapResource(dto)).toEqual(dto);
  });

  it("defaults swagger-optional scalars", () => {
    expect(mapResource({ id: "r-2" })).toEqual({
      id: "r-2",
      name: "",
      description: undefined,
      external_id: undefined,
      status: "",
      created_at: "",
      created_by: undefined,
      updated_at: "",
      updated_by: undefined,
    });
  });

  it("maps created_by / updated_by authorship summaries (RUK-169)", () => {
    const mapped = mapResource({
      id: "r-3",
      name: "orders-db",
      created_by: { id: "u-1", email: "maria@x.io", display_name: "Maria Lopez" },
      updated_by: { id: "u-2", email: "ivan@x.io", display_name: "Ivan K" },
    });
    expect(mapped.created_by).toEqual({ id: "u-1", email: "maria@x.io", displayName: "Maria Lopez" });
    expect(mapped.updated_by).toEqual({ id: "u-2", email: "ivan@x.io", displayName: "Ivan K" });
  });

  it("drops an empty authorship summary to undefined", () => {
    expect(mapResource({ id: "r-4", name: "x", created_by: {} }).created_by).toBeUndefined();
  });
});

describe("mapResourceList", () => {
  it("projects the paginated envelope verbatim (EC-2: total > items)", () => {
    const dto: ListResourcesResponseDto = {
      resources: [
        { id: "r-1", name: "a" },
        { id: "r-2", name: "b" },
      ],
      limit: 50,
      offset: 0,
      total: 137,
    };
    const result = mapResourceList(dto);
    expect(result.resources).toHaveLength(2);
    expect(result.total).toBe(137);
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it("defaults the window to the page length when the backend omits it", () => {
    const result = mapResourceList({ resources: [{ id: "r-1", name: "a" }] });
    expect(result).toEqual({
      resources: [
        {
          id: "r-1",
          name: "a",
          description: undefined,
          external_id: undefined,
          status: "",
          created_at: "",
          updated_at: "",
        },
      ],
      limit: 1,
      offset: 0,
      total: 1,
    });
  });

  it("handles an empty list", () => {
    expect(mapResourceList({})).toEqual({ resources: [], limit: 0, offset: 0, total: 0 });
  });
});
