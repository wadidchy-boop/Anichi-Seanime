class Provider {
    api = "https://shivraapi.my.id/otd"

    getSettings(): Settings {
        return {
            episodeServers: ["ShivraAPI"],
            supportsDub: false,
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const res = await fetch(`${this.api}/search/${encodeURIComponent(opts.query)}`)
        if (!res.ok) return []
        const json = await res.json()
        const list: any[] = json?.data?.animeList ?? []
        const results: SearchResult[] = []
        for (const item of list) {
            const slug = item.slug || item.endpoint || ""
            results.push({
                id: slug,
                title: item.title || item.name || "",
                url: slug,
                subOrDub: "sub",
            })
        }
        return results
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const res = await fetch(`${this.api}/anime/${id}`)
        if (!res.ok) return []
        const json = await res.json()
        const epList: any[] = json?.data?.episodeList ?? []
        const episodes: EpisodeDetails[] = []
        for (let i = 0; i < epList.length; i++) {
            const ep = epList[i]
            const str = ep.episode || ep.title || ""
            const found = str.match(/(\d+)/)
            const num = found ? parseInt(found[1]) : i + 1
            const epSlug = ep.slug || ep.endpoint || String(num)
            episodes.push({
                id: epSlug,
                number: num,
                url: epSlug,
                title: ep.episode || ep.title || `Episode ${num}`,
            })
        }
        episodes.sort((a, b) => a.number - b.number)
        return episodes
    }

    async findEpisodeServer(ep: EpisodeDetails, server: string): Promise<EpisodeServer> {
        const res = await fetch(`${this.api}/episode/${ep.id}`)
        if (!res.ok) return { server, headers: {}, videoSources: [] }
        const json = await res.json()
        const mirrors: any[] = json?.data?.mirrors ?? json?.data?.streamingLink ?? []
        const sources: VideoSource[] = []
        for (const m of mirrors) {
            const u = m.url || m.src || m.link || ""
            if (!u) continue
            sources.push({
                url: u,
                quality: m.quality || m.res || "default",
                type: u.includes(".m3u8") ? "m3u8" as VideoSourceType : "mp4" as VideoSourceType,
            })
        }
        if (sources.length === 0) {
            const direct = json?.data?.streamUrl || json?.data?.url || ""
            if (direct) {
                sources.push({
                    url: direct,
                    quality: "default",
                    type: direct.includes(".m3u8") ? "m3u8" as VideoSourceType : "mp4" as VideoSourceType,
                })
            }
        }
        return {
            server,
            headers: { "Referer": "https://otakudesu.best/" },
            videoSources: sources,
        }
    }
}
