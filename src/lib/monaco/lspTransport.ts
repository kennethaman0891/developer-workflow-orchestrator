/**
 * Monaco ⇄ DWO language-server transport.
 *
 * `monaco-editor@0.56` ships its own LSP client
 * (`monaco.lsp.MonacoLspClient`) behind a pluggable `IMessageTransport`. This
 * module implements that transport against DWO's Rust backend:
 *
 * ```text
 *  MonacoLspClient  ⇄  DwoLspTransport  ⇄  invoke('lsp_write')
 *                                     ⇄  listen('lsp-stdout' / 'lsp-exit')
 *                                             ⇔  stdio child process (Rust)
 * ```
 *
 * ## Why types are *derived*, not re-declared
 *
 * The upstream package exports four values (`MonacoLspClient`,
 * `WebSocketTransport`, `createTransportToWorker`, `createTransportToIFrame`)
 * but **not** the `IMessageTransport` / `Message` / `ConnectionState` types.
 * Re-writing them here would silently drift; instead every type below is
 * derived from the constructor signature of the client itself, so if upstream
 * changes the contract, this file stops compiling rather than stops working.
 *
 * ## Architectural decision — why this is NOT attached to TypeScript/JavaScript
 *
 * Monaco's built-in TypeScript worker (`src/lib/monaco/workers/ts.worker.ts`,
 * wired through `installMonacoEnvironment`) already provides completion,
 * diagnostics, hover and hints for `.ts`/`.js`. `MonacoLspClient` registers
 * providers **globally per document selector** — completion, hover, semantic
 * tokens *and* a push-diagnostics handler writing marker owner `"lsp"`. A
 * second provider set for the same languages would double-register every
 * feature and show each error twice (worker owner + `"lsp"` owner), and the
 * vendored client offers no per-model opt-out.
 *
 * So DWO takes **choice (A): the LSP client attaches only to languages Monaco
 * has *no* language worker for** (python, rust, go, php, … — Monarch
 * highlighting only). That is zero overlap by construction: those languages
 * have no completion/diagnostics provider today, so LSP is a pure addition,
 * and the built-in workers keep serving ts/js/json/css/html untouched.
 *
 * The *backend* still fully supports `typescript-language-server --stdio`
 * (`candidates_for_language("typescript")`) so an opt-in flip later is a
 * frontend-only change — it is simply never requested for ts/js models.
 *
 * ## Failure is non-fatal
 *
 * If `lsp_start` reports `available: false` (the server binary is not
 * installed — the common case), nothing is attached, one `console.warn` is
 * emitted per language, and the editor behaves exactly as it did before.
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type * as MonacoNs from 'monaco-editor';
import { invoke } from '@/lib/tauri';

// ── Types derived from the vendored client ─────────────────────────────────

/** Constructor of Monaco's vendored LSP client (`monaco.lsp.MonacoLspClient`). */
export type LspClientConstructor = typeof MonacoNs.lsp.MonacoLspClient;

/** Instance type of the vendored client. */
export type LspClientInstance = InstanceType<LspClientConstructor>;

/** The `IMessageTransport` contract the vendored client requires. */
export type LspTransportContract = ConstructorParameters<LspClientConstructor>[0];

/** JSON-RPC message as understood by the vendored client. */
export type LspMessage = Parameters<LspTransportContract['send']>[0];

/** `connecting | open | closed` union used by `transport.state`. */
export type LspConnectionState = LspTransportContract['state']['value'];

/** Listener signature passed to `setListener`. */
export type LspMessageListener = Parameters<LspTransportContract['setListener']>[0];

/** Anything disposable — upstream's `IDisposable` is not exported. */
interface DisposableLike {
  dispose(): void;
}

// ── Wire payloads (must match `src-tauri/src/lsp/manager.rs`) ───────────────

/** Payload of the `lsp-stdout` event: one JSON-RPC message, header stripped. */
export interface LspStdoutPayload {
  client_id: string;
  data: string;
}

/** Payload of the `lsp-exit` event: the server stopped, crashed or hit EOF. */
export interface LspExitPayload {
  client_id: string;
}

/** Return value of the `lsp_start` command (snake_case, like every result here). */
export interface LspStartResult {
  available: boolean;
  client_id: string | null;
  /** Why it is unavailable; empty when `available` is true. */
  reason: string;
  /** Resolved `file://` workspace root, sent as `rootUri` when starting. */
  root_uri: string | null;
}

/** Result handed back by {@link createLspClient}. */
export interface DwoLspClientHandle {
  /** Tears down every provider the client registered with Monaco. */
  dispose(): void;
}

// ── State holder ────────────────────────────────────────────────────────────

/**
 * Stand-in for the package's `ValueWithChangeEvent` (also not exported): a
 * readable/writable value that notifies `onChange` subscribers.
 *
 * Comparing with `Object.is` mirrors upstream's identity check — callers hand
 * in fresh state objects, so a new object always fires.
 */
class StateBox<T> {
  private current: T;
  private readonly listeners = new Set<(value: T) => void>();

  constructor(initial: T) {
    this.current = initial;
  }

  get value(): T {
    return this.current;
  }

  set value(next: T) {
    if (Object.is(this.current, next)) return;
    this.current = next;
    // Copy first: a listener may unsubscribe (or subscribe) while firing.
    for (const listener of Array.from(this.listeners)) {
      listener(next);
    }
  }

  get onChange(): (listener: (value: T) => void) => { dispose(): void } {
    return (listener) => {
      this.listeners.add(listener);
      return {
        dispose: () => {
          this.listeners.delete(listener);
        },
      };
    };
  }
}

// ── The transport ───────────────────────────────────────────────────────────

/**
 * `IMessageTransport` bridging Monaco's LSP client to DWO's Rust process
 * relay.
 *
 * Responsibilities:
 *  * **send** — serialize to `lsp_write` (Rust owns `Content-Length` framing).
 *  * **receive** — parse `lsp-stdout` frames back into messages and hand them
 *    to `setListener`, queueing them until a listener exists (upstream sets its
 *    listener from the constructor, but messages can arrive earlier because
 *    `listen()` resolves asynchronously — the queue absorbs that race).
 *  * **state** — `connecting → open` on the first inbound message,
 *    `→ closed` on stop, server exit or write failure.
 */
export class DwoLspTransport {
  readonly #language: string;
  readonly #clientId: string;
  readonly #rootUri: string;

  readonly #state = new StateBox<LspConnectionState>({ state: 'connecting' });
  #listener: LspMessageListener | undefined;
  #pending: LspMessage[] = [];
  #unlisten: UnlistenFn | undefined;
  #unlistenExit: UnlistenFn | undefined;
  #disposed = false;

  constructor(language: string, clientId: string, rootUri: string) {
    this.#language = language;
    this.#clientId = clientId;
    this.#rootUri = rootUri;
    // Subscribing is async; `#pending` buffers anything that lands first.
    void this.#subscribe();
  }

  /** `IMessageTransport.state` — read by the vendored client's stream logger. */
  get state(): StateBox<LspConnectionState> {
    return this.#state;
  }

  /** `IMessageTransport.setListener` — reentrant: may run during flush. */
  setListener(listener: LspMessageListener | undefined): void {
    this.#listener = listener;
    if (!listener) return;
    while (this.#pending.length > 0 && this.#listener) {
      const message = this.#pending.shift();
      if (!message) break;
      try {
        this.#listener(message);
      } catch (error) {
        console.error(`[lsp] ${this.toString()} listener threw:`, error);
      }
    }
  }

  /**
   * `IMessageTransport.send` — writes one JSON-RPC message to the server.
   *
   * Rejection policy mirrors what the vendored client can actually absorb:
   *  * **requests** (`id` set) reject, so `sendRequest` fails fast instead of
   *    awaiting a response that will never arrive;
   *  * **notifications** (no `id`) are logged and swallowed, because callers
   *    (`textDocument/didOpen`, `didChange`, `initialized`…) never await them
   *    and a rejection would surface as an unhandled promise rejection.
   */
  async send(message: LspMessage): Promise<void> {
    const isNotification = message.id === undefined;
    const data = this.#serialize(message);

    if (this.#disposed || this.#state.value.state === 'closed') {
      const error = new Error(`[lsp] ${this.toString()} is closed`);
      if (isNotification) {
        console.debug(`[lsp] dropped ${message.method}:`, error.message);
        return;
      }
      throw error;
    }

    try {
      await invoke('lsp_write', { clientId: this.#clientId, data });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      // A write only fails when the child is gone or unknown — both permanent.
      this.close(error);
      if (isNotification) {
        console.warn(`[lsp] dropped ${message.method}:`, error.message);
        return;
      }
      throw error;
    }
  }

  /** `IMessageTransport.toString` — keep this diagnosable in logs. */
  toString(): string {
    return `DwoLspTransport(${this.#language}:${this.#clientId})`;
  }

  /**
   * Unsubscribe from the backend events and mark the transport closed.
   *
   * Deliberately does **not** call `lsp_stop`: the server's lifecycle belongs
   * to whoever started it (the editor effect), so a transport can be replaced
   * without killing a server another model still uses.
   */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unlisten?.();
    this.#unlisten = undefined;
    this.#unlistenExit?.();
    this.#unlistenExit = undefined;
    this.#pending = [];
    this.#listener = undefined;
    this.#state.value = { state: 'closed', error: undefined };
  }

  /** Mark the connection closed with an error (server exit, failed write). */
  close(error?: Error): void {
    if (this.#disposed || this.#state.value.state === 'closed') return;
    this.#state.value = { state: 'closed', error };
  }

  // ── internals ────────────────────────────────────────────────────────────

  async #subscribe(): Promise<void> {
    try {
      const unlisten = await listen<LspStdoutPayload>('lsp-stdout', (event) => {
        const payload = event.payload;
        if (!payload || payload.client_id !== this.#clientId) return;
        this.#receive(payload.data);
      });
      if (this.#disposed) unlisten();
      else this.#unlisten = unlisten;
    } catch (error) {
      // No event stream (web mode / Tauri unavailable): fail the connection.
      this.close(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    try {
      const unlisten = await listen<LspExitPayload>('lsp-exit', (event) => {
        if (event.payload?.client_id !== this.#clientId) return;
        this.close(new Error(`language server exited (${this.#language})`));
      });
      if (this.#disposed) unlisten();
      else this.#unlistenExit = unlisten;
    } catch (error) {
      console.warn(`[lsp] ${this.toString()} could not listen for lsp-exit:`, error);
    }
  }

  /** Buffer-or-deliver one decoded message and flip `connecting → open`. */
  #receive(data: string): void {
    let message: LspMessage;
    try {
      message = JSON.parse(data) as LspMessage;
    } catch (error) {
      console.warn(`[lsp] ${this.toString()} discarded an unparseable message:`, error);
      return;
    }

    if (this.#state.value.state === 'connecting') {
      this.#state.value = { state: 'open' };
    }

    if (this.#listener) {
      try {
        this.#listener(message);
      } catch (error) {
        console.error(`[lsp] ${this.toString()} listener threw:`, error);
      }
    } else {
      this.#pending.push(message);
    }
  }

  /**
   * Serialize a message, patching the `initialize` handshake.
   *
   * `MonacoLspClient._init()` hardcodes `rootUri: null` (and no workspace
   * folders), which would leave rust-analyzer/pyright without a project. The
   * real root was resolved by `lsp_start` — walk up to the nearest project
   * marker — so it is substituted here, on the way out.
   */
  #serialize(message: LspMessage): string {
    if (message.method === 'initialize') {
      const params = message.params;
      if (params && typeof params === 'object' && !Array.isArray(params)) {
        params.rootUri = this.#rootUri;
        params.workspaceFolders = [
          { uri: this.#rootUri, name: folderName(this.#rootUri) },
        ];
      }
    }
    return JSON.stringify(message);
  }
}

/** Last path segment of a `file://` URI, for `workspaceFolders[].name`. */
function folderName(uri: string): string {
  const withoutQuery = uri.split(/[?#]/)[0];
  const trimmed = withoutQuery.endsWith('/') ? withoutQuery.slice(0, -1) : withoutQuery;
  const index = trimmed.lastIndexOf('/');
  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
}

// ── Client factory ──────────────────────────────────────────────────────────

/**
 * Feature stores of live clients, keyed by instance.
 *
 * `MonacoLspClient.createFeatures()` returns the `DisposableStore` for every
 * provider it registered — but the constructor throws that return value away,
 * leaving clients permanently registered with Monaco. Overriding
 * `createFeatures()` (a prototype method, so normal virtual dispatch applies)
 * captures it, which is what makes real teardown possible.
 *
 * A `WeakMap` rather than a subclass field: field initializers run *after*
 * `super()` returns, and `createFeatures()` is called *from* `super()` — a
 * plain field would clobber the captured store on construction.
 */
const featureStores = new WeakMap<object, DisposableLike>();

function safeDispose(disposable: DisposableLike | undefined): void {
  try {
    disposable?.dispose();
  } catch (error) {
    console.warn('[lsp] dispose failed:', error);
  }
}

/**
 * Construct a {@link LspClientConstructor} instance whose providers can later
 * be torn down, and keep an `initialize` failure from escaping as an
 * unhandled rejection (the vendored client never awaits its own init promise).
 *
 * Call order on teardown matters and is the caller's responsibility:
 * `client.dispose()` **before** `transport.dispose()`, so `textDocument/didClose`
 * notifications still have a live transport to ride out on.
 */
export function createLspClient(
  Ctor: LspClientConstructor,
  transport: LspTransportContract & { close?: (error?: Error) => void },
): DwoLspClientHandle {
  class DwoLspClient extends Ctor {
    protected createFeatures(): DisposableLike {
      const store = super.createFeatures();
      featureStores.set(this, store);
      return store;
    }

    dispose(): void {
      const store = featureStores.get(this);
      if (store) {
        featureStores.delete(this);
        safeDispose(store);
      }
      // Reach into the two other disposables the base class keeps private-ish
      // (`__publicField` assignments, so plain own properties at runtime):
      // the document synchronizer (sends didClose) and the capability registry.
      const internals = this as unknown as {
        _bridge?: DisposableLike;
        _capabilitiesRegistry?: DisposableLike;
      };
      safeDispose(internals._bridge);
      safeDispose(internals._capabilitiesRegistry);
    }
  }

  const client = new DwoLspClient(transport);

  // `_init` is fired without a catch in the vendored constructor; swallow and
  // surface it once, closing the transport so no request waits forever.
  const initPromise = (client as unknown as { _initPromise?: Promise<unknown> })._initPromise;
  if (initPromise && typeof initPromise.catch === 'function') {
    initPromise.catch((error: unknown) => {
      console.warn(`[lsp] ${transport.toString()} initialize failed:`, error);
      transport.close?.(error instanceof Error ? error : new Error(String(error)));
    });
  }

  return client;
}
