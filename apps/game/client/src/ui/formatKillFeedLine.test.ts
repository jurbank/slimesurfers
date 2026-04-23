import { describe, expect, it, vi } from "vite-plus/test";
import type { KillEventMessage } from "@splat/protocol/network/serverMessages.ts";
import { WeaponId } from "@splat/protocol/network/weaponIds.ts";
import { formatKillFeedLine } from "./formatKillFeedLine.ts";

describe("formatKillFeedLine", () => {
  it("uses local-player wording and weapon bucket text", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const event: KillEventMessage = {
      seq: 1,
      killerSessionId: "local",
      killerName: "Alpha",
      killerSlimeColor: 0x33ccff,
      killerPatternId: 0,
      victimSessionId: "remote",
      victimName: "Bravo",
      victimSlimeColor: 0xff6633,
      victimPatternId: 1,
      weaponId: WeaponId.Bazooka,
      isSelfKill: false,
    };

    const formatted = formatKillFeedLine(event, "local");
    const text = formatted.segments.map((segment) => segment.text).join("");

    expect(formatted.involvement).toBe("killer");
    expect(formatted.templateId).toBe("bazooka-goo");
    expect(text).toBe("💥 You blasted Bravo into goo");

    vi.restoreAllMocks();
  });
});
