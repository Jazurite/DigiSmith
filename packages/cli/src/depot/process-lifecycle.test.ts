import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  parseListeningPort,
  parseNetstatPidForPort,
  parseLsofPid,
  parseSsPidForPort,
  listenerCommand,
  isProcessAlive,
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

describe("parseLsofPid", () => {
  it("returns the first pid line", () => {
    expect(parseLsofPid("48211\n48212\n")).toBe("48211");
  });

  it("returns null for empty output", () => {
    expect(parseLsofPid("")).toBeNull();
  });

  it("ignores non-numeric lines", () => {
    expect(parseLsofPid("lsof: WARNING: can't stat() fuse\n48211\n")).toBe("48211");
  });
});

describe("parseSsPidForPort", () => {
  const header = "State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process";

  it("finds the pid for an IPv4 listener", () => {
    const out = [header, 'LISTEN 0      511    127.0.0.1:54321    0.0.0.0:*    users:(("node",pid=1234,fd=18))'].join("\n");
    expect(parseSsPidForPort(out, 54321)).toBe("1234");
  });

  it("finds the pid for an IPv6 and a wildcard listener", () => {
    const v6 = 'LISTEN 0      511    [::1]:54321    [::]:*    users:(("node",pid=77,fd=9))';
    const star = 'LISTEN 0      511    *:54321    *:*    users:(("node",pid=88,fd=9))';
    expect(parseSsPidForPort(v6, 54321)).toBe("77");
    expect(parseSsPidForPort(star, 54321)).toBe("88");
  });

  it("does not match a longer port that ends the same way", () => {
    const out = 'LISTEN 0 511 127.0.0.1:154321 0.0.0.0:* users:(("node",pid=5,fd=9))';
    expect(parseSsPidForPort(out, 54321)).toBeNull();
  });

  it("returns null when there is no process column", () => {
    expect(parseSsPidForPort("LISTEN 0 511 127.0.0.1:54321 0.0.0.0:*", 54321)).toBeNull();
  });
});

describe("listenerCommand", () => {
  it("uses lsof on darwin", () => {
    const c = listenerCommand("darwin", 4000);
    expect([c.command, ...c.args]).toEqual(["lsof", "-nP", "-iTCP:4000", "-sTCP:LISTEN", "-t"]);
    expect(c.parse("123\n")).toBe("123");
  });

  it("uses ss on linux", () => {
    const c = listenerCommand("linux", 4000);
    expect([c.command, ...c.args]).toEqual(["ss", "-ltnp"]);
    expect(c.parse('LISTEN 0 511 127.0.0.1:4000 0.0.0.0:* users:(("node",pid=9,fd=3))')).toBe("9");
  });

  it("uses netstat on win32", () => {
    const c = listenerCommand("win32", 4000);
    expect([c.command, ...c.args]).toEqual(["netstat", "-ano"]);
    const out = "  TCP    127.0.0.1:4000        0.0.0.0:0              LISTENING       6789";
    expect(c.parse(out)).toBe("6789");
  });

  it("treats other platforms like linux", () => {
    expect(listenerCommand("freebsd", 4000).command).toBe("ss");
  });
});

describe("isProcessAlive", () => {
  it("is true for this process and false for an unused pid", () => {
    expect(isProcessAlive(String(process.pid))).toBe(true);
    expect(isProcessAlive("2147483646")).toBe(false);
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

describe("stopProcess errors", () => {
  let tmpDir: string;
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // win32 path on a host without taskkill (macOS, Linux): the spawn fails with ENOENT.
  it.skipIf(process.platform === "win32")(
    "returns an error and keeps the tracking file when taskkill does not exist (spawn ENOENT)",
    () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
      const trackingFile = path.join(tmpDir, "tracking.json");
      writeTracking(trackingFile, { pid: "2147483646", port: 1 });
      const result = stopProcess({ label: "dummy", trackingFile }, "win32");
      expect(result.stopped).toBe(false);
      expect(result.error).toMatch(/taskkill/);
      expect(readTracking(trackingFile)).not.toBeNull();
    }
  );

  it("reports stopped when the tracked pid is already gone (posix)", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "depot-lifecycle-"));
    const trackingFile = path.join(tmpDir, "tracking.json");
    writeTracking(trackingFile, { pid: "2147483646", port: 1 });
    expect(stopProcess({ label: "dummy", trackingFile }, "linux").stopped).toBe(true);
    expect(readTracking(trackingFile)).toBeNull();
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
