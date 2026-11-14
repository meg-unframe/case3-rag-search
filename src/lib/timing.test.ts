import { describe, expect, it } from "vitest";
import { createTimer } from "./timing";

describe("createTimer", () => {
  it("区間ごとの時間と total を Server-Timing 形式で返す", async () => {
    let t = 0;
    const timer = createTimer(() => t);
    await timer.measure("auth", async () => {
      t += 12.34;
    });
    const v = await timer.measure("embed", async () => {
      t += 250;
      return "ok";
    });
    expect(v).toBe("ok");
    expect(timer.header()).toBe("auth;dur=12.3, embed;dur=250.0, total;dur=262.3");
  });

  it("失敗した区間も時間を記録し、例外はそのまま投げる", async () => {
    let t = 0;
    const timer = createTimer(() => t);
    await expect(
      timer.measure("generate", async () => {
        t += 100;
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
    expect(timer.header()).toBe("generate;dur=100.0, total;dur=100.0");
  });

  it("区間名は英小文字・数字・_ - のみ", async () => {
    await expect(createTimer().measure("bad name", async () => 1)).rejects.toThrow(/invalid/);
  });
});
