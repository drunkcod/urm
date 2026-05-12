
export type ResolvedHeaders = Readonly<Record<string, string>>;

export type ResolvedURL = {
	url: URL;
	headers: HeaderResolver;
};

export interface URLResolver {
	(url: string | URL): ResolvedURL;
	get hosts(): Readonly<string[]>;
}

export type HeaderResolver = () => Promise<ResolvedHeaders>;

type HostRecord = { protocol: string; host: string; headers: HeaderResolver };

const bareFrozen = <T>(x: T): Readonly<T> =>
	Object.freeze({
		__proto__: null,
		...x,
	});

const EMPTY_HEADERS = Promise.resolve(bareFrozen({} as Record<string, string>));
const EmptyHeaders = () => EMPTY_HEADERS;

export class URLResolverBuilder {
	readonly #hostMap: Record<string, Readonly<HostRecord> | undefined> = Object.create(null);
	private constructor() {}

	static create() {
		return new URLResolverBuilder();
	}

	add(host: string, url: URL, headers?: HeaderResolver): this {
		const { protocol, host: destination } = url;
		if (url.pathname !== '/' || url.search || url.hash) throw new Error('Target must be host only.');
		this.#hostMap[host.toLowerCase()] = Object.freeze({
			protocol,
			host: destination,
			headers: headers ?? EmptyHeaders,
		});
		return this;
	}

	build(): URLResolver {
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
		return Object.assign(resolve, {
			hosts: Object.freeze(Object.keys(knownHosts)),
		});
	}
}
