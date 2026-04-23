/// <reference path="./onlinestream-provider.d.ts" />

/**
 * Anichi (ShivraAPI / Otakudesu) - Seanime Online Streaming Provider
 *
 * Bridges the ShivraAPI used by anichi-cli into Seanime's streaming extension system.
 * Source: https://shivraapi.my.id/otd  (wraps otakudesu.best)
 *
 * Note: Content is in Indonesian (sub/raw). Subs are in Bahasa Indonesia.
 */

class Provider {
    private api = "https://shivraapi.my.id/otd"

    getSettings(): Settings {
        return {
            episodeServers: ["ShivraAPI"],
            supportsDub: false,
        }
    }

    /**
     * Search for anime by title query.
     * Seanime calls this with the anime's romaji/english title.
     * Returns matched results so Seanime can find the right slug.
     */
    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const query = encodeURIComponent(opts.query)
        const res = await fetch(`${this.api}/search/${query}`)
        if (!res.ok) return []

        const json = await res.json() as any
        const list: any[] = json?.data?.animeList ?? []

        const results: SearchResult[] = []
        for (const item of list) {
            results.push({
                id: item.slug ?? item.endpoint,          // e.g. "shaman-king-sub-indo"
                title: item.title ?? item.name ?? "",
                url: item.endpoint ?? item.slug ?? "",
                isSub: true,
                isDub: false,
            })
        }
        return results
    }

    /**
     * Given the anime ID (slug), return an episode list.
     * Seanime uses this to list episodes for the user to pick from.
     */
    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        // The detail endpoint returns episode list
        const res = await fetch(`${this.api}/anime/${id}`)
        if (!res.ok) return []

        const json = await res.json() as any
        const epList: any[] = json?.data?.episodeList ?? []

        const episodes: EpisodeDetails[] = []
        for (const ep of epList) {
            // episodeList items typically have: { episode, slug, endpoint }
            const epNum = this.parseEpNumber(ep.episode ?? ep.title ?? "")
            episodes.push({
                id: ep.slug ?? ep.endpoint ?? String(epNum),
                number: epNum,
                url: ep.endpoint ?? ep.slug ?? "",
                title: ep.episode ?? ep.title ?? `Episode ${epNum}`,
                isSub: true,
                isDub: false,
            })
        }

        // Sort ascending by episode number
        episodes.sort((a, b) => a.number - b.number)
        return episodes
    }

    /**
     * Given the episode ID (slug), return video sources for playback.
     * Seanime calls this when the user picks an episode.
     */
    async findEpisodeServer(ep: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        const res = await fetch(`${this.api}/episode/${ep.id}`)
        if (!res.ok) {
            return { headers: {}, sources: [], subtitles: [] }
        }

        const json = await res.json() as any

        // ShivraAPI returns mirror links in data.mirrors or data.streamingLink
        const mirrors: any[] = json?.data?.mirrors ?? json?.data?.streamingLink ?? []
        const sources: VideoSource[] = []

        for (const mirror of mirrors) {
            const url = mirror.url ?? mirror.src ?? mirror.link ?? ""
            if (!url) continue

            // Determine quality label
            const quality = mirror.quality ?? mirror.res ?? mirror.label ?? "default"
            const isM3u8 = url.includes(".m3u8")

            sources.push({
                url,
                quality,
                isM3u8,
            })
        }

        // Fallback: try direct streaming URL fields
        if (sources.length === 0) {
            const direct = json?.data?.streamUrl ?? json?.data?.url ?? ""
            if (direct) {
                sources.push({
                    url: direct,
                    quality: "default",
                    isM3u8: direct.includes(".m3u8"),
                })
            }
        }

        return {
            headers: {
                "Referer": "https://otakudesu.best/",
            },
            sources,
            subtitles: [],
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    private parseEpNumber(str: string): number {
        // Try to extract a number from strings like "Episode 5", "Ep 12", "5", etc.
        const match = str.match(/(\d+(?:\.\d+)?)/)
        if (match) return parseFloat(match[1])
        return 0
    }
}

