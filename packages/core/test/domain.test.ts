import { describe, expect, it } from "vitest";
import type { RequisiteNode } from "../src/types/domain.js";

describe("RequisiteNode", () => {
  it("supports a nested AND/OR tree", () => {
    const tree: RequisiteNode = {
      type: "and",
      nodes: [
        { type: "course", subject: "COMPSCI", number: "1027A/B" },
        {
          type: "or",
          nodes: [
            { type: "course", subject: "CALCULUS", number: "1000A/B" },
            { type: "course", subject: "MATH", number: "1600A/B" },
          ],
        },
      ],
    };
    expect(tree.type).toBe("and");
    expect(tree.nodes).toHaveLength(2);
  });
});
