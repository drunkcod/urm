import { describe, it, expect, jest } from '@jest/globals';
import { URLResolverBuilder, staticHeaders } from './URLResolver.js';

describe('URLResolverBuilder', () => {
	it('build returns a resolver with no hosts by default', () => {
		const resolver = URLResolverBuilder.create().build();
		expect(resolver.hosts).toEqual([]);
	});

	it('add registers a host', () => {
		const resolver = URLResolverBuilder.create()
			.add('example.com', new URL('https://internal.example.com'))
			.build();
		expect(resolver.hosts).toContain('example.com');
	});

	it('throws if target URL has a path', () => {
		expect(() =>
			URLResolverBuilder.create().add('example.com', new URL('https://internal.example.com/path'))
		).toThrow();
	});

	it('throws if target URL has a query string', () => {
		expect(() =>
			URLResolverBuilder.create().add('example.com', new URL('https://internal.example.com?q=1'))
		).toThrow();
	});
});

describe('URLResolver', () => {
	it('rewrites host and protocol for a known host', () => {
		const resolver = URLResolverBuilder.create()
			.add('example.com', new URL('https://internal.example.com'))
			.build();
		const { url } = resolver('http://example.com/some/path');
		expect(url.host).toBe('internal.example.com');
		expect(url.protocol).toBe('https:');
	});

	it('preserves path and query for a known host', () => {
		const resolver = URLResolverBuilder.create()
			.add('example.com', new URL('https://internal.example.com'))
			.build();
		const { url } = resolver('http://example.com/foo/bar?baz=1');
		expect(url.pathname).toBe('/foo/bar');
		expect(url.search).toBe('?baz=1');
	});

	it('passes through unknown hosts unchanged', () => {
		const resolver = URLResolverBuilder.create().build();
		const { url } = resolver('http://other.com/path');
		expect(url.host).toBe('other.com');
		expect(url.protocol).toBe('http:');
	});

	it('returns empty headers for unknown hosts', async () => {
		const resolver = URLResolverBuilder.create().build();
		const { headers } = resolver('http://other.com/path');
		expect(await headers()).toEqual({});
	});

	it('returns custom headers for a known host', async () => {
		const customHeaders = async () => ({ Authorization: 'Bearer token' });
		const resolver = URLResolverBuilder.create()
			.add('example.com', new URL('https://internal.example.com'), customHeaders)
			.build();
		const { headers } = resolver('http://example.com/');
		expect(await headers()).toEqual({ Authorization: 'Bearer token' });
	});

	it('host matching is case-insensitive', () => {
		const resolver = URLResolverBuilder.create()
			.add('Example.COM', new URL('https://internal.example.com'))
			.build();
		const { url } = resolver('http://example.com/path');
		expect(url.host).toBe('internal.example.com');
	});

	it('passes through unchanged when the incoming port does not match a registered host', () => {
		const resolver = URLResolverBuilder.create()
			.add('example.com', new URL('https://internal.example.com'))
			.build();
		const { url } = resolver('http://example.com:8080/path');
		expect(url.host).toBe('example.com:8080');
		expect(url.protocol).toBe('http:');
	});

	it('re-registering a host overwrites the previous mapping', () => {
		const resolver = URLResolverBuilder.create()
			.add('example.com', new URL('https://first.example.com'))
			.add('example.com', new URL('https://second.example.com'))
			.build();
		const { url } = resolver('http://example.com/path');
		expect(url.host).toBe('second.example.com');
		expect(resolver.hosts).toEqual(['example.com']);
	});
});

describe('URLResolver.fetch', () => {
	it('fetches the resolved URL with resolved headers merged under init headers', async () => {
		const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
		const resolver = URLResolverBuilder.create(fetchMock)
			.add('example.com', new URL('https://internal.example.com'), staticHeaders({
				Authorization: 'Bearer token',
				'X-From': 'resolver',
			}))
			.build();

		await resolver.fetch('http://example.com/path', { headers: { 'X-From': 'caller' } });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [calledUrl, calledInit] = fetchMock.mock.calls[0];
		expect(String(calledUrl)).toBe('https://internal.example.com/path');
		expect(Object.fromEntries(calledInit?.headers as Headers)).toEqual({
			authorization: 'Bearer token',
			'x-from': 'caller',
		});
	});

	it('caller headers override resolver headers case-insensitively', async () => {
		const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
		const resolver = URLResolverBuilder.create(fetchMock)
			.add('example.com', new URL('https://internal.example.com'), staticHeaders({
				Authorization: 'Bearer resolver-token',
			}))
			.build();

		await resolver.fetch('http://example.com/path', { headers: { authorization: 'Bearer caller-token' } });

		const [, calledInit] = fetchMock.mock.calls[0];
		const merged = calledInit?.headers as Headers;
		expect([...merged]).toEqual([['authorization', 'Bearer caller-token']]);
	});

	it('fetches unknown hosts unchanged with no extra headers, skipping Headers construction', async () => {
		const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
		const resolver = URLResolverBuilder.create(fetchMock).build();

		await resolver.fetch('http://other.com/path');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [calledUrl, calledInit] = fetchMock.mock.calls[0];
		expect(String(calledUrl)).toBe('http://other.com/path');
		expect(calledInit).toEqual({});
		expect(calledInit?.headers).toBeUndefined();
	});

	it('skips building Headers for a matched host with no registered headers and no caller headers', async () => {
		const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
		const resolver = URLResolverBuilder.create(fetchMock)
			.add('example.com', new URL('https://internal.example.com'))
			.build();

		await resolver.fetch('http://example.com/path', { method: 'POST' });

		const [, calledInit] = fetchMock.mock.calls[0];
		expect(calledInit).toEqual({ method: 'POST' });
		expect(calledInit?.headers).toBeUndefined();
	});

	it('resolves different headers per call from the caller-supplied context', async () => {
		type ClientContext = { clientId: string };
		const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
		const resolver = URLResolverBuilder.create<ClientContext>(fetchMock)
			.add('example.com', new URL('https://internal.example.com'), async (ctx) => ({
				Authorization: `Bearer ${ctx?.clientId}`,
			}))
			.build();

		await resolver.fetch('http://example.com/path', { context: { clientId: 'acme' } });
		await resolver.fetch('http://example.com/path', { context: { clientId: 'globex' } });

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(Object.fromEntries(fetchMock.mock.calls[0][1]?.headers as Headers)).toEqual({ authorization: 'Bearer acme' });
		expect(Object.fromEntries(fetchMock.mock.calls[1][1]?.headers as Headers)).toEqual({ authorization: 'Bearer globex' });
	});
});

describe('URLResolver.bind', () => {
	type ClientContext = { clientId: string };

	it('fetch no longer needs a context, using the bound one instead', async () => {
		const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
		const resolver = URLResolverBuilder.create<ClientContext>(fetchMock)
			.add('example.com', new URL('https://internal.example.com'), async (ctx) => ({
				Authorization: `Bearer ${ctx?.clientId}`,
			}))
			.build();

		const bound = resolver.bind({ clientId: 'acme' });
		await bound.fetch('http://example.com/path');

		expect(Object.fromEntries(fetchMock.mock.calls[0][1]?.headers as Headers)).toEqual({
			authorization: 'Bearer acme',
		});
	});

	it('the callable resolver also uses the bound context, with no argument to headers()', async () => {
		type ClientContext = { clientId: string };
		const resolver = URLResolverBuilder.create<ClientContext>()
			.add('example.com', new URL('https://internal.example.com'), async (ctx) => ({
				Authorization: `Bearer ${ctx?.clientId}`,
			}))
			.build();

		const bound = resolver.bind({ clientId: 'globex' });
		const { headers } = bound('http://example.com/path');

		expect(await headers()).toEqual({ Authorization: 'Bearer globex' });
	});

	it('preserves hosts and the Empty-headers fast path across bind', async () => {
		const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
		const resolver = URLResolverBuilder.create<ClientContext>(fetchMock)
			.add('example.com', new URL('https://internal.example.com'))
			.build();

		const bound = resolver.bind({ clientId: 'acme' });
		expect(bound.hosts).toEqual(['example.com']);

		await bound.fetch('http://example.com/path');

		const [, calledInit] = fetchMock.mock.calls[0];
		expect(calledInit).toEqual({});
		expect(calledInit?.headers).toBeUndefined();
	});
});
