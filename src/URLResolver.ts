
export type ResolvedHeaders = Readonly<Record<string, string>>;

export type HeaderResolver<Context> = (args?: Context) => Promise<ResolvedHeaders>;

export type ResolvedURL<Context> = {
	url: URL;
	headers: HeaderResolver<Context>;
};

interface ContextRequestInit<Context> extends RequestInit {
	context?: Context;
}

export interface URLResolver<Context = void> {
	(url: string | URL): ResolvedURL<Context>;
	get hosts(): Readonly<string[]>;
	get fetch(): (url: string | URL, init?: ContextRequestInit<Context>) => Promise<Response>;
}

type HostRecord<Context> = { protocol: string; host: string; headers: HeaderResolver<Context> };

const bareFrozen = <T>(x: T): Readonly<T> =>
	Object.freeze({
		__proto__: null,
		...x,
	});

export const staticHeaders = (x: Record<string, string>) => {
	const headers = Promise.resolve(bareFrozen(x));
	return () => headers;
}

const EmptyHeaders = staticHeaders({});

export class URLResolverBuilder<Context = void> {
	readonly #hostMap: Record<string, Readonly<HostRecord<Context>> | undefined> = Object.create(null);
	private constructor() {}

	static create<Context = void>() {
		return new URLResolverBuilder<Context>();
	}

	add(host: string, url: URL, headers?: HeaderResolver<Context>): this {
		const { protocol, host: destination } = url;
		if (url.pathname !== '/' || url.search || url.hash) throw new Error('Target must be host only.');
		this.#hostMap[host.toLowerCase()] = Object.freeze({
			protocol,
			host: destination,
			headers: headers ?? EmptyHeaders,
		});
		return this;
	}

	build(): URLResolver<Context> {
		const knownHosts = bareFrozen(this.#hostMap);
		const resolve = (url: string | URL) => {
			const u = new URL(url);
			const h = knownHosts[u.host];
			if (h) {
				u.host = h.host;
				u.protocol = h.protocol;
			}
			return { url: u, headers: h?.headers ?? EmptyHeaders };
		};
		return Object.freeze(Object.assign(resolve, {
			hosts: Object.freeze(Object.keys(knownHosts)),
			fetch: async (url: string | URL, init?: ContextRequestInit<Context>) => {
				const { url: resolvedUrl, headers } = resolve(url);
				return fetch(resolvedUrl, {
					...init,
					headers: { ...await headers(init?.context), ...init?.headers },
				})
			}
		}));
	}
}
