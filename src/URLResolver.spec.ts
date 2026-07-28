import { describe, it, expect, jest, afterEach } from '@jest/globals';
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
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('fetches the resolved URL with resolved headers merged under init headers', async () => {
		const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
		const resolver = URLResolverBuilder.create()
			.add('example.com', new URL('https://internal.example.com'), staticHeaders({
				Authorization: 'Bearer token',
				'X-From': 'resolver',
			}))
			.build();

		await resolver.fetch('http://example.com/path', { headers: { 'X-From': 'caller' } });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [calledUrl, calledInit] = fetchMock.mock.calls[0];
		expect(String(calledUrl)).toBe('https://internal.example.com/path');
		expect(calledInit?.headers).toEqual({
			Authorization: 'Bearer token',
			'X-From': 'caller',
		});
	});

	it('fetches unknown hosts unchanged with no extra headers', async () => {
		const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
		const resolver = URLResolverBuilder.create().build();

		await resolver.fetch('http://other.com/path');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [calledUrl, calledInit] = fetchMock.mock.calls[0];
		expect(String(calledUrl)).toBe('http://other.com/path');
		expect(calledInit?.headers).toEqual({});
	});

	it('resolves different headers per call from the caller-supplied context', async () => {
		type ClientContext = { clientId: string };
		const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
		const resolver = URLResolverBuilder.create<ClientContext>()
			.add('example.com', new URL('https://internal.example.com'), async (ctx) => ({
				Authorization: `Bearer ${ctx?.clientId}`,
			}))
			.build();

		await resolver.fetch('http://example.com/path', { context: { clientId: 'acme' } });
		await resolver.fetch('http://example.com/path', { context: { clientId: 'globex' } });

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer acme' });
		expect(fetchMock.mock.calls[1][1]?.headers).toEqual({ Authorization: 'Bearer globex' });
	});
});
