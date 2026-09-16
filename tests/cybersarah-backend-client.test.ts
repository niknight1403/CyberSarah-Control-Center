import { describe, expect, it, vi } from "vitest";

import {
  backendBaseUrl,
  connectTasksStream,
  parseBackendEvent,
  parseSseBlock,
  streamChat,
  type BackendSocketLike,
} from "@/lib/cybersarah-backend-client";

describe("backendBaseUrl", () => {
  it("nimmt die EXPO_PUBLIC-Variable vor dem Default", () => {
    const original = process.env.EXPO_PUBLIC_CYBERSARAH_BACKEND_URL;
    process.env.EXPO_PUBLIC_CYBERSARAH_BACKEND_URL = "http://localhost:8000/";
    try {
      expect(backendBaseUrl()).toBe("http://localhost:8000");
    } finally {
      if (original === undefined) delete process.env.EXPO_PUBLIC_CYBERSARAH_BACKEND_URL;
      else process.env.EXPO_PUBLIC_CYBERSARAH_BACKEND_URL = original;
    }
  });

  it("faellt auf die Render-Produktions-URL zurueck", () => {
    const original = process.env.EXPO_PUBLIC_CYBERSARAH_BACKEND_URL;
    delete process.env.EXPO_PUBLIC_CYBERSARAH_BACKEND_URL;
    try {
      expect(backendBaseUrl()).toBe("https://cybersarah-backend.onrender.com");
    } finally {
      if (original !== undefined) process.env.EXPO_PUBLIC_CYBERSARAH_BACKEND_URL = original;
    }
  });
});

describe("parseBackendEvent", () => {
  it("parst gueltige Events", () => {
    const event = parseBackendEvent('{"type":"task.created","data":{"id":1},"ts":123}');
    expect(event).toEqual({ type: "task.created", data: { id: 1 }, ts: 123 });
  });

  it("weist Muell zurueck, ohne zu crashen", () => {
    expect(parseBackendEvent("kein json")).toBeNull();
    expect(parseBackendEvent('{"data":{}')).toBeNull();
    expect(parseBackendEvent('{"data":{"x":1}}')).toBeNull();
  });
});

describe("parseSseBlock", () => {
  it("extrahiert Deltas, done und error aus mehreren Frames", () => {
    const block = [
      'data: {"delta":"Hallo "}',
      'data: {"delta":"CyberSarah"}',
      "",
      'data: {"done":true}',
    ].join("\n");
    const parsed = parseSseBlock(block);
    expect(parsed.deltas).toEqual(["Hallo ", "CyberSarah"]);
    expect(parsed.done).toBe(true);
    expect(parsed.error).toBeNull();
  });

  it("ueberspringt ungueltige Frames", () => {
    const parsed = parseSseBlock("data: {kaputt}\ndata: {\"delta\":\"ok\"}");
    expect(parsed.deltas).toEqual(["ok"]);
  });

  it("erkennt Fehler-Frames", () => {
    const parsed = parseSseBlock('data: {"error":"Backend 500"}');
    expect(parsed.error).toBe("Backend 500");
  });
});

describe("connectTasksStream", () => {
  function fakeSocketFactory(captured: BackendSocketLike[]) {
    return (url: string): BackendSocketLike => {
      expect(url).toContain("/ws/tasks");
      const socket: BackendSocketLike = {
        send: vi.fn(),
        close: vi.fn(() => socket.onclose?.()),
        onmessage: () => {},
        onclose: () => {},
      };
      captured.push(socket);
      return socket;
    };
  }

  it("reicht Events an onEvent weiter", () => {
    const sockets: BackendSocketLike[] = [];
    const seen: string[] = [];
    const handle = connectTasksStream(
      (event) => seen.push(event.type),
      fakeSocketFactory(sockets),
      () => 1,
    );
    sockets[0].onmessage('{"type":"log.appended","data":{}}');
    expect(seen).toEqual(["log.appended"]);
    handle.close();
  });

  it("ignoriert unguelige Nachrichten und reconnectet nach close", () => {
    const sockets: BackendSocketLike[] = [];
    const handle = connectTasksStream(
      () => {},
      fakeSocketFactory(sockets),
      () => 1,
    );
    sockets[0].onmessage("müll");
    expect(sockets).toHaveLength(1);
    sockets[0].onclose();
    // Backoff 1 ms — der naechste Tick sollte die zweite Verbindung oeffnen.
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(sockets.length).toBeGreaterThanOrEqual(2);
        handle.close();
        resolve(null);
      }, 30);
    });
  });

  it("close() verhindert weitere Reconnects", () => {
    const sockets: BackendSocketLike[] = [];
    const handle = connectTasksStream(
      () => {},
      fakeSocketFactory(sockets),
      () => 1,
    );
    handle.close();
    sockets[0].onclose();
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(sockets).toHaveLength(1);
        resolve(null);
      }, 30);
    });
  });
});

describe("streamChat", () => {
  it("stellt Deltas wortgenau bereit und meldet done", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode('data: {"delta":"Ant"}\n\n'));
        controller.enqueue(enc.encode('data: {"delta":"wort"}\n\n'));
        controller.enqueue(enc.encode('data: {"done":true}\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, body }),
    );
    const deltas: string[] = [];
    let done = 0;
    await streamChat([{ role: "user", content: "Hi" }], {
      onDelta: (d) => deltas.push(d),
      onDone: () => {
        done += 1;
      },
    });
    expect(deltas).toEqual(["Ant", "wort"]);
    expect(done).toBe(1);
    vi.unstubAllGlobals();
  });

  it("meldet HTTP-Fehler ueber onError statt zu crashen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, body: null }),
    );
    const errors: string[] = [];
    await streamChat([{ role: "user", content: "Hi" }], {
      onDelta: () => {},
      onError: (m) => errors.push(m),
    });
    expect(errors).toEqual(["Backend 503"]);
    vi.unstubAllGlobals();
  });
});
