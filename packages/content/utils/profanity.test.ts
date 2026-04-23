import { expect, test } from "vite-plus/test";
import { isProfane, cleanName } from "./profanity.ts";

test("isProfane identifies bad words", () => {
  expect(isProfane("fuck")).toBe(true);
  expect(isProfane("SHIT")).toBe(true);
  expect(isProfane("f.u.c.k")).toBe(true);
  expect(isProfane("hello")).toBe(false);
  expect(isProfane("nice player")).toBe(false);
});

test("cleanName replaces bad names", () => {
  const cleaned = cleanName("fuck");
  expect(cleaned).toMatch(/^Surfer\d+$/);

  expect(cleanName("GoodPlayer")).toBe("GoodPlayer");
});
