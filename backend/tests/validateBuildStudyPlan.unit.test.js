import { describe, it, expect, vi } from "vitest";
import { validateBuildStudyPlan } from "../Input_validators/ValidateQuestions.js";
import { buildStudyPlanHandler } from "../controllers/questionController.js";

// ---------------------------------------------------------------------------
// POST /api/question/study-plan — malformed problems must be rejected with
// 400 instead of silently riding along into a generated plan (issue #2319).
// ---------------------------------------------------------------------------

const makeReq = (body = {}) => ({ body });

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
};

describe("validateBuildStudyPlan — route layer (issue #2319)", () => {
  it.each([
    ["null entry", [null, { title: "Valid", difficulty: "easy" }]],
    ["string entry", ["not a problem", { title: "Valid", difficulty: "easy" }]],
    ["empty object entry", [{}, { title: "Valid", difficulty: "easy" }]],
    ["entry with blank title", [{ title: "   " }, { title: "Valid", difficulty: "easy" }]],
    ["entry with no title at all", [{ difficulty: "hard" }, { title: "Valid" }]],
  ])("rejects a %s with 400 and reports its index", (_label, problems) => {
    const res = mockRes();
    const next = vi.fn();

    validateBuildStudyPlan(makeReq({ problems, days: 3 }), res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Validation failed");
    // The invalid entry is at index 0 — the field path must surface it.
    expect(res.body.errors.some((e) => e.field.startsWith("problems.0"))).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a title longer than 300 characters", () => {
    const res = mockRes();
    const next = vi.fn();
    const problems = [{ title: "x".repeat(301) }];

    validateBuildStudyPlan(makeReq({ problems, days: 1 }), res, next);

    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an oversized difficulty field", () => {
    const res = mockRes();
    const next = vi.fn();
    const problems = [{ title: "Two Sum", difficulty: "x".repeat(21) }];

    validateBuildStudyPlan(makeReq({ problems, days: 1 }), res, next);

    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects more than 1000 problems", () => {
    const res = mockRes();
    const next = vi.fn();
    const problems = Array.from({ length: 1001 }, (_, i) => ({ title: `P${i}` }));

    validateBuildStudyPlan(makeReq({ problems, days: 5 }), res, next);

    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([0, -1, 2.5, 366, "not-a-number", undefined])(
    "rejects an invalid days value (%s)",
    (days) => {
      const res = mockRes();
      const next = vi.fn();
      const problems = [{ title: "Two Sum" }];

      validateBuildStudyPlan(makeReq({ problems, days }), res, next);

      expect(res.statusCode).toBe(400);
      expect(next).not.toHaveBeenCalled();
    }
  );

  it("passes a well-formed request through to the handler", () => {
    const res = mockRes();
    const next = vi.fn();
    const problems = [
      { title: "Two Sum", difficulty: "easy" },
      { title: "Merge Intervals", difficulty: "medium", links: { leetcode: "https://leetcode.com/x" } },
    ];

    validateBuildStudyPlan(makeReq({ problems, days: 2 }), res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("keeps the documented fallback: missing difficulty is allowed through", () => {
    const res = mockRes();
    const next = vi.fn();

    validateBuildStudyPlan(makeReq({ problems: [{ title: "Two Sum" }], days: 1 }), res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// buildStudyPlanHandler — end-to-end with valid, already-validated input.
// ---------------------------------------------------------------------------
describe("buildStudyPlanHandler (issue #2319)", () => {
  it("places every valid problem exactly once, with title preserved", async () => {
    const res = mockRes();
    const problems = [
      { title: "Two Sum", difficulty: "easy" },
      { title: "Merge Intervals", difficulty: "medium" },
      { title: "Word Ladder", difficulty: "hard" },
    ];

    await buildStudyPlanHandler(makeReq({ problems, days: 2 }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    const placed = res.body.plan.flatMap((d) => d.problems);
    expect(placed).toHaveLength(3);
    expect(placed.map((p) => p.title).sort()).toEqual(
      ["Merge Intervals", "Two Sum", "Word Ladder"].sort()
    );
  });

  it("still 400s if called without the route-layer validator (defensive backstop)", async () => {
    const res = mockRes();

    await buildStudyPlanHandler(makeReq({ problems: [], days: 3 }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });
});