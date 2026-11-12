import { describe, expect, it } from "vitest";
import { getOwnProjects, isOwnProject, isPendingInvite } from "@/lib/project-access";

const publicJob = { client_id: "client-1", freelancer_id: null, freelancer_email: null };

describe("project invitations", () => {
  it("does not treat a public job-board project without an email invite as a pending invite", () => {
    expect(isPendingInvite(publicJob, "freelancer-1", "free@example.com")).toBe(false);
  });

  it("shows a pending invite only to the explicitly invited email", () => {
    const invited = { ...publicJob, freelancer_email: "Free@Example.com" };
    expect(isPendingInvite(invited, "freelancer-1", "free@example.com")).toBe(true);
    expect(isPendingInvite(invited, "freelancer-2", "other@example.com")).toBe(false);
  });

  it("keeps unassigned public jobs out of the freelancer's own projects", () => {
    expect(isOwnProject(publicJob, "freelancer-1")).toBe(false);
    expect(isOwnProject({ ...publicJob, freelancer_id: "freelancer-1" }, "freelancer-1")).toBe(true);
  });
});
