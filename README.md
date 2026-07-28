# @drunkcod/urm

µResourceMesh — just enough of a resolver to be useful.

Maps public-facing hostnames to internal destinations, rewriting protocol and
host while leaving path, query, and hash untouched. Optionally attaches
per-host headers (e.g. auth tokens) that are resolved lazily on each request.

## Install

```bash
npm install @drunkcod/urm
```

This package is ESM-only (`"type": "module"`) and targets Node.js 22+.

## Usage

```ts
import { URLResolverBuilder, staticHeaders } from '@drunkcod/urm';

const resolver = URLResolverBuilder.create()
	.add('api.example.com', new URL('https://internal.example.svc'))
	.add('auth.example.com', new URL('https://internal-auth.example.svc'), staticHeaders({
		Authorization: 'Bearer some-token',
	}))
	.build();

const { url, headers } = resolver('https://api.example.com/v1/orders?status=open');
// url.href === 'https://internal.example.svc/v1/orders?status=open'

const response = await resolver.fetch('https://auth.example.com/token');
// request is sent to https://internal-auth.example.svc/token
// with an `Authorization: Bearer some-token` header merged in
```

Unknown hosts pass through unchanged, with empty headers.

Headers can also vary per call via a typed context, e.g. picking an
auth header based on which client is calling:

```ts
type ClientContext = { clientId: string };

const perClient = URLResolverBuilder.create<ClientContext>()
	.add('api.example.com', new URL('https://internal.example.svc'), async (ctx) => ({
		Authorization: `Bearer ${await tokenFor(ctx!.clientId)}`,
	}))
	.build();

await perClient.fetch('https://api.example.com/orders', { context: { clientId: 'acme' } });
```

## API

### `URLResolverBuilder.create<Context = void>(fetchImpl = globalThis.fetch)`

Starts a new builder. `fetchImpl` is the function `.build()`'s `fetch` helper
calls internally — defaults to the global `fetch`, but any compatible
implementation can be substituted (a fake for tests, undici with a custom
`Agent`, an instrumented wrapper, etc).

`Context` types the optional, caller-supplied value threaded through to every
`HeaderResolver` on this builder and through `resolver.fetch`'s `context`
option — e.g. a `{ clientId: string }` shape for picking headers based on
which client is calling. All hosts on one builder share the same `Context`
shape; use a separate resolver per "domain" if you need unrelated shapes.

### `.add(host, target, headers?)`

Registers a mapping from `host` (matched case-insensitively against the
*exact* host of incoming URLs, including port) to `target`. `target` must be
a bare origin — no path, query, or hash — or `.add()` throws. `headers`, if
given, is a `HeaderResolver<Context>` (`(context?: Context) => Promise<Record<string, string>>`)
called fresh on every resolution, so it can refresh short-lived tokens or
vary by context.

### `.build()`

Returns a frozen `URLResolver`:

- `resolver(url)` — resolves a `string | URL` to `{ url, headers }`. If the
  host is registered, `url`'s protocol and host are rewritten to the target;
  otherwise the URL is returned unchanged.
- `resolver.hosts` — a frozen array of every registered host.
- `resolver.fetch(url, init?)` — resolves `url`, merges the resolved headers
  under any headers passed in `init.headers` (caller wins on conflicts,
  matched case-insensitively), and calls the configured `fetch`. Pass
  `init.context` to thread a value through to the registered `HeaderResolver`s.

### `staticHeaders(headers)`

Wraps a plain header object as a `HeaderResolver` that always resolves to the
same frozen value. Useful when there's nothing to refresh.

## Development

```bash
npm test    # typecheck + jest
npm run build
```

## License

MIT — see [LICENSE](./LICENSE).
