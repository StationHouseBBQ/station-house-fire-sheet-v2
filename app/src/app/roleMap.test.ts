import { describe, expect, it } from "vitest";
import { mapStaffRoleToUiRole } from "./roleMap";
import { STAFF_ROLES, type StaffRole } from "./auth";

describe("mapStaffRoleToUiRole", () => {
  it("owner → owner_admin", () => {
    expect(mapStaffRoleToUiRole("owner")).toBe("owner_admin");
  });
  it("manager → owner_admin (full operational UI; profile management blocked by RLS)", () => {
    expect(mapStaffRoleToUiRole("manager")).toBe("owner_admin");
  });
  it("counter → counter_foh", () => {
    expect(mapStaffRoleToUiRole("counter")).toBe("counter_foh");
  });
  it("kitchen → kitchen", () => {
    expect(mapStaffRoleToUiRole("kitchen")).toBe("kitchen");
  });
  it("catering → catering_director", () => {
    expect(mapStaffRoleToUiRole("catering")).toBe("catering_director");
  });
  it("marketing → catering_director (RLS still blocks orders/customers)", () => {
    expect(mapStaffRoleToUiRole("marketing")).toBe("catering_director");
  });

  it("is exhaustive: every staff_role enum value maps to a valid RoleId", () => {
    const validUiRoles = ["owner_admin", "catering_director", "kitchen", "counter_foh", "packing"];
    expect(STAFF_ROLES).toHaveLength(6);
    for (const staff of STAFF_ROLES) {
      expect(validUiRoles).toContain(mapStaffRoleToUiRole(staff));
    }
  });

  it("throws on values outside the enum (runtime guard)", () => {
    expect(() => mapStaffRoleToUiRole("dishwasher" as StaffRole)).toThrow(/Unmapped staff role/);
  });
});
