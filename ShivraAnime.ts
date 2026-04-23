/// <reference path="./online-streaming-provider.d.ts" />

/**
 * ShivraAnime - Seanime Online Streaming Provider
 * Source: https://shivraapi.my.id/otd (Otakudesu)
 * Indonesian subtitled anime
 */

const BASE = "https://shivraapi.my.id/otd"

class Provider {

    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiServer: true,
            serverList: ["DefaultStream", "odstream", "ondesuvip", "kraken", "mp4load"],
            supportedTypes: [MediaFormat.TV, MediaFormat.MOVIE, MediaFormat.OVA, MediaFormat.ONA],
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        try {
            const res = await fetch(`${BASE}/search?q=${encodeURIComponent(opts.query)}`)
            const data = res.json() as any
            const list = data?.data?.list ?? []

            return list.map((item: any) => ({
                id: item.slug,
                title: item.title,
                url: item.url,
                image: item.cover,
                year: null,
            }))
        } catch (e) {
            return []
        }
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        try {
            const res = await fetch(`${BASE}/anime/${id}`)
            const data = res.json() as any
            const eps = data?.data?.episode_list ?? []

            return eps.map((ep: any, i: number) => ({
                id: ep.slug,
                number: i + 1,
                url: ep.url,
                title: ep.title || `Episode ${i + 1}`,
            }))
        } catch (e) {
            return []
        }
    }

    async findEpisodeServer(id: string, server: string): Promise<EpisodeServer> {
        try {
            const res = await fetch(`${BASE}/episode/${id}`)
            const data = res.json() as any
            const epData = data?.data

            if (!epData) return { sources: [], subtitles: [] }

            const sources: EpisodeServerSource[] = []

            // Add default streaming source
            if (epData.defaultstreaming) {
                sources.push({
                    url: epData.defaultstreaming,
                    quality: "auto",
                    isM3U8: false,
                })
            }

            // Add quality-specific sources matching the requested server
            const streams = epData.stream ?? []
            for (const stream of streams) {
                const providers = stream.providers ?? []
                for (const p of providers) {
                    if (!server || server === "DefaultStream" || p.provider?.toLowerCase().includes(server.toLowerCase())) {
                        sources.push({
                            url: p.url,
                            quality: stream.quality ?? "auto",
                            isM3U8: false,
                        })
                    }
                }
            }

            return {
                sources,
                subtitles: [],
            }
        } catch (e) {
            return { sources: [], subtitles: [] }
        }
    }
}
