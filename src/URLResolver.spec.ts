import { describe, it, expect } from '@jest/globals';
import { URLResolverBuilder } from './URLResolver.js';

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
});
