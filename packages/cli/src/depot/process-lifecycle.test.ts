import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  parseListeningPort,
  parseNetstatPidForPort,
  isPidListed,
  readTracking,
  writeTracking,
  ensureProcess,
  stopProcess,
} from "./process-lifecycle.ts";

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// A killed child is a zombie — still "alive" to kill(pid, 0) — until Node's event loop runs and
// reaps it. A synchronous (Atomics.wait) sleep blocks that same event loop, so the poll must
// actually yield via a real timer.
async function waitUntilDead(pid: number, timeoutMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isAlive(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return !isAlive(pid);
}

describe("parseListeningPort", () => {
  it("extracts the port from a listening line", () => {
    expect(parseListeningPort("some preamble\nopencode server listening on http://127.0.0.1:54321\n")).toBe(54321);
  });

  it("works regardless of the prefix text before 'listening on'", () => {
    expect(parseListeningPort("agentic-bridge listening on http://127.0.0.1:9999")).toBe(9999);
  });

  it("returns null when there is no listening line", () => {
    expect(parseListeningPort("starting up...\n")).toBeNull();
  });
});

describe("parseNetstatPidForPort", () => {
  it("finds the pid bound to the given port's LISTENING line", () => {
    const output = [
      "  Proto  Local Address          Foreign Address        State           PID",
      "  TCP    127.0.0.1:54321        0.0.0.0:0              LISTENING       6789",
    ].join("\r\n");
    expect(parseNetstatPidForPort(output, 54321)).toBe("6789");
  });

  it("returns null when no LISTENING line matches the port", () => {
    const output = "  TCP    127.0.0.1:1111        0.0.0.0:0              LISTENING       6789";
    expect(parseNetstatPidForPort(output, 54321)).toBeNull();
  });

  it("ignores non-LISTENING lines for the same port", () => {
    const output = "  TCP    127.0.0.1:54321       10.0.0.5:1234          ESTABLISHED     1111";
    expect(parseNetstatPidForPort(output, 54321)).toBeNull();
  });
});

describe("isPidListed", () => {
  it("finds the pid in tasklist output", () => {
    const output = '"node.exe","12345","Console","1","20,000 K"';
    expect(isPidListed(output, "12345")).toBe(true);
  });

  it("returns false when the pid is absent", () => {
    const output = '"node.exe","99999","Console","1","20,000 K"';
    expect(isPidListed(output, "12345")).toBe(false);
  });
});

describe("tracking file read/write", () => {
  let tmpDir: string;
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("round-trips a tracking record, creating parent directories as needed", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    const file = path.join(tmpDir, "sub", "tracking.json");
    writeTracking(file, { pid: "123", port: 456 });
    expect(readTracking(file)).toEqual({ pid: "123", port: 456 });
  });

  it("returns null when the file is absent", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    expect(readTracking(path.join(tmpDir, "missing.json"))).toBeNull();
  });

  it("returns null when the file has the wrong shape", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    const file = path.join(tmpDir, "tracking.json");
    fs.writeFileSync(file, JSON.stringify({ pid: 123 }));
    expect(readTracking(file)).toBeNull();
  });

  it("returns null when the file is not valid JSON", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    const file = path.join(tmpDir, "tracking.json");
    fs.writeFileSync(file, "not json");
    expect(readTracking(file)).toBeNull();
  });
});

describe("ensureProcess / stopProcess against a real child process", () => {
  let tmpDir: string;
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts a real process, tracks its confirmed PID and port, reuses it, then stops it", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    const trackingFile = path.join(tmpDir, "tracking.json");
    const logFile = path.join(tmpDir, "server.log");
    const dummyServerScript =
      'const s=require("node:net").createServer();' +
      's.listen(0,"127.0.0.1",()=>{console.log("dummy listening on http://127.0.0.1:"+s.address().port);});' +
      "setInterval(()=>{},1000);";

    const { port } = ensureProcess({
      label: "dummy",
      trackingFile,
      logFile,
      spawnCommand: () => ({ command: process.execPath, args: ["-e", dummyServerScript] }),
    });

    expect(port).toBeGreaterThan(0);
    const tracked = readTracking(trackingFile);
    expect(tracked).not.toBeNull();
    expect(tracked?.port).toBe(port);

    const second = ensureProcess({
      label: "dummy",
      trackingFile,
      logFile,
      spawnCommand: () => {
        throw new Error("should not spawn again — the tracked process is still alive");
      },
    });
    expect(second.port).toBe(port);

    const stopResult = stopProcess({ label: "dummy", trackingFile });
    expect(stopResult.stopped).toBe(true);
    expect(readTracking(trackingFile)).toBeNull();

    const stopAgain = stopProcess({ label: "dummy", trackingFile });
    expect(stopAgain.stopped).toBe(false);
  }, 15000);

  it("kills the process it spawned when it cannot confirm the pid and throws", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    const trackingFile = path.join(tmpDir, "tracking.json");
    const logFile = path.join(tmpDir, "server.log");
    const pidFile = path.join(tmpDir, "child.pid");
    // Port 1 is never actually bound, so netstat (on any platform) finds no owner for it and
    // ensureProcess's PID-confirmation step throws — deterministically, not just on this host.
    const dummyServerScript =
      `require("node:fs").writeFileSync(${JSON.stringify(pidFile)},String(process.pid));` +
      'console.log("dummy listening on http://127.0.0.1:1");' +
      "setInterval(()=>{},1000);";

    let thrown: unknown;
    try {
      ensureProcess({
        label: "dummy",
        trackingFile,
        logFile,
        spawnCommand: () => ({ command: process.execPath, args: ["-e", dummyServerScript] }),
      });
    } catch (err) {
      thrown = err;
    }
    const spawnedPid = fs.existsSync(pidFile) ? Number(fs.readFileSync(pidFile, "utf-8")) : undefined;

    try {
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toMatch(/could not confirm a PID/);
      expect(spawnedPid).toBeDefined();
      expect(await waitUntilDead(spawnedPid!)).toBe(true);
    } finally {
      if (spawnedPid !== undefined && isAlive(spawnedPid)) {
        try {
          process.kill(spawnedPid, "SIGKILL");
        } catch {
          // already gone
        }
      }
    }
  }, 15000);

  it("throws with the log content when the process never logs a listening line", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    const trackingFile = path.join(tmpDir, "tracking.json");
    const logFile = path.join(tmpDir, "server.log");

    expect(() =>
      ensureProcess({
        label: "dummy",
        trackingFile,
        logFile,
        spawnCommand: () => ({ command: process.execPath, args: ["-e", 'console.log("no listening line here")'] }),
      })
    ).toThrow(/failed to start/);
  }, 10000);

  it("fails fast with a PATH error instead of stalling for 5s when the binary doesn't exist", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    const trackingFile = path.join(tmpDir, "tracking.json");
    const logFile = path.join(tmpDir, "server.log");

    const start = Date.now();
    expect(() =>
      ensureProcess({
        label: "dummy",
        trackingFile,
        logFile,
        spawnCommand: () => ({ command: "this-binary-does-not-really-exist-xyz", args: [] }),
      })
    ).toThrow(/not found on PATH/);
    expect(Date.now() - start).toBeLessThan(2000);
  }, 10000);
});
