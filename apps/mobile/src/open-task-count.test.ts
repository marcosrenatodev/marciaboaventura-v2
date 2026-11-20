import { describe, expect, it } from "vitest";
import { formatOpenTaskCount } from "./open-task-count";

describe("formatOpenTaskCount", () => {
  it("uses plural for zero and multiple open tasks", () => {
    expect(formatOpenTaskCount(0)).toBe("0 tarefas em aberto");
    expect(formatOpenTaskCount(2)).toBe("2 tarefas em aberto");
  });

  it("uses singular for one open task", () => {
    expect(formatOpenTaskCount(1)).toBe("1 tarefa em aberto");
  });
});
