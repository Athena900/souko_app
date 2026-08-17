import { afterEach, describe, expect, it } from "vitest";
import { isDemoMode } from "@/src/lib/env";

const originalDemoMode = process.env.DEMO_MODE;
const originalAppEnv = process.env.APP_ENV;
const originalVercelEnv = process.env.VERCEL_ENV;
const originalNodeEnv = process.env.NODE_ENV;
const env = process.env as Record<string, string | undefined>;

afterEach(() => {
  if (originalDemoMode === undefined) delete env.DEMO_MODE;
  else env.DEMO_MODE = originalDemoMode;
  if (originalAppEnv === undefined) delete env.APP_ENV;
  else env.APP_ENV = originalAppEnv;
  if (originalVercelEnv === undefined) delete env.VERCEL_ENV;
  else env.VERCEL_ENV = originalVercelEnv;
  if (originalNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = originalNodeEnv;
});

describe("isDemoMode", () => {
  it("honors an explicit demo-mode disable in a Cloudflare staging environment", () => {
    env.APP_ENV = "staging";
    env.DEMO_MODE = "false";
    env.NODE_ENV = "production";
    delete env.VERCEL_ENV;

    expect(isDemoMode()).toBe(false);
  });

  it("enables demo mode for an explicitly named Cloudflare demo environment", () => {
    env.APP_ENV = "demo";
    delete env.DEMO_MODE;
    env.NODE_ENV = "production";
    delete env.VERCEL_ENV;

    expect(isDemoMode()).toBe(true);
  });

  it("never enables demo mode for an explicitly named production environment", () => {
    env.APP_ENV = "production";
    env.DEMO_MODE = "true";
    env.NODE_ENV = "production";
    delete env.VERCEL_ENV;

    expect(isDemoMode()).toBe(false);
  });

  it("enables demo mode on a Vercel Preview even though NODE_ENV is production", () => {
    env.DEMO_MODE = "true";
    env.NODE_ENV = "production";
    env.VERCEL_ENV = "preview";

    expect(isDemoMode()).toBe(true);
  });

  it("never enables demo mode on a Vercel production deployment", () => {
    env.DEMO_MODE = "true";
    env.NODE_ENV = "production";
    env.VERCEL_ENV = "production";

    expect(isDemoMode()).toBe(false);
  });

  it("defaults a Vercel Preview to demo mode unless it is explicitly disabled", () => {
    delete env.DEMO_MODE;
    env.NODE_ENV = "production";
    env.VERCEL_ENV = "preview";

    expect(isDemoMode()).toBe(true);
  });

  it("honors an explicit demo-mode disable on a non-production deployment", () => {
    env.DEMO_MODE = "false";
    env.NODE_ENV = "production";
    env.VERCEL_ENV = "preview";

    expect(isDemoMode()).toBe(false);
  });
});
