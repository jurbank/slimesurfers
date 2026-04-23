import { expect, test } from "vite-plus/test";
import { generateGuestPlayerName } from "./guestPlayerNames.ts";
import { cleanName, isProfane, normalizePlayerName } from "./profanity.ts";

test("isProfane identifies bad words", () => {
  expect(isProfane("fuck")).toBe(true);
  expect(isProfane("SHIT")).toBe(true);
  expect(isProfane("f.u.c.k")).toBe(true);
  expect(isProfane("sh1t")).toBe(true);
  expect(isProfane("b1tch")).toBe(true);
  expect(isProfane("f4gg0t")).toBe(true);
  expect(isProfane("hello")).toBe(false);
  expect(isProfane("nice player")).toBe(false);
  expect(isProfane("Skater101")).toBe(false);
  expect(isProfane("Racer357")).toBe(false);
});

test("cleanName replaces bad names", () => {
  const cleaned = cleanName("fuck");
  expect(cleaned).toMatch(/^[A-Za-z]+ [A-Za-z]+$/);

  expect(cleanName("GoodPlayer")).toBe("GoodPlayer");
});

test("normalizePlayerName keeps only safe player name text", () => {
  expect(normalizePlayerName("  Alpha   Bravo  ")).toBe("Alpha Bravo");
  expect(normalizePlayerName("<script>alert(1)</script>")).toBe("scriptalert1script");
  expect(normalizePlayerName("Zero\u0000Width\u007f")).toBe("ZeroWidth");
  expect(normalizePlayerName("Name🙂")).toBe("Name");
  expect(normalizePlayerName("abcdefghijklmnopqrstuvwxyz")).toBe("abcdefghijklmnopqrst");
});

test("cleanName falls back for invalid or profane names", () => {
  expect(cleanName("<>", "Player 1")).toBe("Player 1");
  expect(cleanName(null, "Player 2")).toBe("Player 2");
  expect(cleanName("f.u.c.k", "Player 3")).toBe("Player 3");
});

test("generateGuestPlayerName combines the lexicon deterministically", () => {
  expect(generateGuestPlayerName(0)).toBe("Slime Rider");
  expect(generateGuestPlayerName(12)).toBe("Slime Bandit");
  expect(generateGuestPlayerName(25)).toBe("Turbo Wizard");
});
